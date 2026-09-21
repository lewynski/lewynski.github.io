// Vercel Serverless Function: /api/analyze
//
// Required Vercel Environment Variable:
//
// VIRUSTOTAL_API_KEY = your VirusTotal API key
//
// IMPORTANT:
// Never put your VirusTotal API key inside index.html.

const VT_BASE = "https://www.virustotal.com/api/v3";

/* -------------------------------------------------------
   RESPONSE HELPER
------------------------------------------------------- */

function send(res, status, body) {
  return res.status(status).json(body);
}

/* -------------------------------------------------------
   CREATE VIRUSTOTAL URL ID

   VirusTotal identifies URLs using URL-safe Base64
   without "=" padding.
------------------------------------------------------- */

function base64UrlWithoutPadding(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/* -------------------------------------------------------
   NORMALIZE URL
------------------------------------------------------- */

function normalizeUrl(raw) {
  let value = String(raw || "").trim();

  if (!value) {
    throw new Error("URL is required.");
  }

  if (!/^https?:\/\//i.test(value)) {
    value = "https://" + value;
  }

  const parsed = new URL(value);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  return parsed.href;
}

/* -------------------------------------------------------
   VIRUSTOTAL FETCH HELPER
------------------------------------------------------- */

async function vtFetch(path, apiKey, options = {}) {
  return fetch(VT_BASE + path, {
    ...options,

    headers: {
      "x-apikey": apiKey,
      ...(options.headers || {})
    }
  });
}

/* -------------------------------------------------------
   GET EXISTING VIRUSTOTAL URL REPORT
------------------------------------------------------- */

async function getUrlReport(url, apiKey) {
  const id = base64UrlWithoutPadding(url);

  const response = await vtFetch(
    `/urls/${encodeURIComponent(id)}`,
    apiKey
  );

  // URL does not exist in VirusTotal yet
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `VirusTotal report request failed (${response.status}): ` +
      body.slice(0, 250)
    );
  }

  return response.json();
}

/* -------------------------------------------------------
   SUBMIT NEW URL TO VIRUSTOTAL
------------------------------------------------------- */

async function submitUrl(url, apiKey) {
  const body = new URLSearchParams({
    url: url
  });

  const response = await vtFetch(
    "/urls",
    apiKey,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },

      body
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `VirusTotal submit failed (${response.status}): ` +
      text.slice(0, 250)
    );
  }

  const json = await response.json();

  return json?.data?.id || null;
}

/* -------------------------------------------------------
   GET VIRUSTOTAL ANALYSIS STATUS
------------------------------------------------------- */

async function getAnalysis(analysisId, apiKey) {
  const response = await vtFetch(
    `/analyses/${encodeURIComponent(analysisId)}`,
    apiKey
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `VirusTotal analysis request failed (${response.status}): ` +
      text.slice(0, 250)
    );
  }

  return response.json();
}

/* -------------------------------------------------------
   SMALL DELAY
------------------------------------------------------- */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* -------------------------------------------------------
   NORMALIZE VIRUSTOTAL ENGINE STATISTICS
------------------------------------------------------- */

function cleanStats(stats = {}) {
  const malicious = Number(stats.malicious || 0);
  const suspicious = Number(stats.suspicious || 0);
  const harmless = Number(stats.harmless || 0);
  const undetected = Number(stats.undetected || 0);
  const timeout = Number(stats.timeout || 0);
  const failure = Number(stats.failure || 0);

  const unsupported =
    Number(stats["type-unsupported"] || 0);

  const total =
    malicious +
    suspicious +
    harmless +
    undetected +
    timeout +
    failure +
    unsupported;

  return {
    malicious,
    suspicious,
    harmless,
    undetected,
    timeout,
    failure,
    unsupported,
    total
  };
}

/* -------------------------------------------------------
   CALCULATE RISK SCORE

   IMPORTANT:
   This is a RISK SCORE from 0-100.

   It is NOT:
   - a percentage chance that the website is malicious
   - VirusTotal's official percentage
   - an AI confidence percentage

------------------------------------------------------- */

function calculateRiskScore(stats) {
  const s = cleanStats(stats);

  if (s.total <= 0) {
    return 0;
  }

  /*
     Malicious verdict = full weight
     Suspicious verdict = half weight
  */

  const weightedRate =
    (
      (s.malicious * 1.0) +
      (s.suspicious * 0.5)
    ) / s.total;

  let score = Math.round(
    weightedRate * 100
  );

  /*
     IMPORTANT:

     Simply calculating:

        malicious / total

     can make dangerous URLs look too safe.

     Example:

        6 malicious
        80 total

     Raw percentage = 7.5%

     That does NOT mean the website only has a
     7.5% risk.

     So we also consider the absolute number
     of vendors flagging the URL.
  */

  if (s.malicious >= 10) {
    score = Math.max(score, 92);
  }

  else if (s.malicious >= 6) {
    score = Math.max(score, 82);
  }

  else if (s.malicious >= 4) {
    score = Math.max(score, 70);
  }

  else if (s.malicious >= 3) {
    score = Math.max(score, 60);
  }

  else if (s.malicious >= 2) {
    score = Math.max(score, 45);
  }

  else if (s.malicious === 1) {
    score = Math.max(score, 25);
  }

  /*
     Suspicious verdicts only
  */

  if (s.malicious === 0) {

    if (s.suspicious >= 4) {
      score = Math.max(score, 40);
    }

    else if (s.suspicious >= 2) {
      score = Math.max(score, 25);
    }

    else if (s.suspicious === 1) {
      score = Math.max(score, 12);
    }

  }

  return Math.max(
    0,
    Math.min(100, score)
  );
}

/* -------------------------------------------------------
   MAIN VERCEL API HANDLER
------------------------------------------------------- */

module.exports = async function handler(req, res) {

  /*
     Don't cache security results.
  */

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  /* ---------------------------------------------------
     ONLY ALLOW POST
  --------------------------------------------------- */

  if (req.method !== "POST") {

    res.setHeader(
      "Allow",
      "POST"
    );

    return send(
      res,
      405,
      {
        error: "Method not allowed. Use POST."
      }
    );
  }

  /* ---------------------------------------------------
     GET API KEY
  --------------------------------------------------- */

  const apiKey =
    process.env.VIRUSTOTAL_API_KEY;

  if (!apiKey) {

    return send(
      res,
      500,
      {
        error:
          "VIRUSTOTAL_API_KEY is not configured on the server."
      }
    );
  }

  /* ---------------------------------------------------
     VALIDATE URL
  --------------------------------------------------- */

  let url;

  try {

    url = normalizeUrl(
      req.body?.url
    );

  }

  catch (err) {

    return send(
      res,
      400,
      {
        error:
          err.message ||
          "Invalid URL."
      }
    );
  }

  /* ---------------------------------------------------
     VIRUSTOTAL ANALYSIS
  --------------------------------------------------- */

  try {

    /*
       First check if VirusTotal already
       knows about this exact URL.
    */

    let report =
      await getUrlReport(
        url,
        apiKey
      );

    let source =
      "existing_report";

    /* -------------------------------------------------
       NEW URL
    ------------------------------------------------- */

    if (!report) {

      source =
        "new_scan";

      const analysisId =
        await submitUrl(
          url,
          apiKey
        );

      if (!analysisId) {

        throw new Error(
          "VirusTotal did not return an analysis ID."
        );
      }

      /*
         Wait briefly for VirusTotal.

         Public API scans may take a little time.
      */

      for (
        let attempt = 0;
        attempt < 4;
        attempt++
      ) {

        await sleep(850);

        const analysis =
          await getAnalysis(
            analysisId,
            apiKey
          );

        const status =
          analysis?.data?.attributes?.status;

        if (
          status === "completed"
        ) {
          break;
        }
      }

      /*
         Request normalized URL report
         after analysis.
      */

      report =
        await getUrlReport(
          url,
          apiKey
        );
    }

    /* -------------------------------------------------
       REPORT NOT READY
    ------------------------------------------------- */

    if (
      !report?.data?.attributes
    ) {

      return send(
        res,
        202,
        {
          error:
            "VirusTotal accepted the URL, but the report is not ready yet. Scan again in a few seconds."
        }
      );
    }

    /* -------------------------------------------------
       READ VIRUSTOTAL DATA
    ------------------------------------------------- */

    const attributes =
      report.data.attributes;

    const stats =
      cleanStats(
        attributes.last_analysis_stats || {}
      );

    const riskScore =
      calculateRiskScore(stats);

    /* -------------------------------------------------
       RETURN DATA TO PHISHGUARD.HTML
    ------------------------------------------------- */

    return send(
      res,
      200,
      {
        ok: true,

        source,

        /*
           Main risk score
        */

        risk_score:
          riskScore,

        /*
           Kept for compatibility with
           older PhishGuard frontend.
        */

        score:
          riskScore,

        /*
           Actual VirusTotal statistics
        */

        vt_data: stats,

        /*
           Additional VT information
        */

        reputation:
          Number(
            attributes.reputation || 0
          ),

        last_analysis_date:
          attributes.last_analysis_date ||
          null
      }
    );

  }

  catch (err) {

    console.error(
      "PhishGuard /api/analyze error:",
      err
    );

    return send(
      res,
      502,
      {
        error:
          err?.message ||
          "VirusTotal request failed."
      }
    );
  }
};
