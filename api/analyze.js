// api/analyze.js
// Vercel Serverless Function for PhishGuard
//
// Required Vercel environment variable:
//
// VIRUSTOTAL_API_KEY = your VirusTotal API key
//
// NEVER put the API key inside index.html.

const VT_BASE = "https://www.virustotal.com/api/v3";


/* =====================================================
   RESPONSE
===================================================== */

function send(res, status, body) {
  res.status(status).json(body);
}


/* =====================================================
   NORMALIZE URL
===================================================== */

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
    throw new Error(
      "Only HTTP and HTTPS URLs are supported."
    );
  }

  return parsed.href;
}


/* =====================================================
   CREATE VIRUSTOTAL URL ID
===================================================== */

function toVirusTotalUrlId(url) {

  return Buffer
    .from(url, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


/* =====================================================
   VIRUSTOTAL FETCH
===================================================== */

async function vtFetch(
  path,
  apiKey,
  options = {}
) {

  return fetch(
    VT_BASE + path,
    {
      ...options,

      headers: {

        "x-apikey": apiKey,

        ...(options.headers || {})
      }
    }
  );
}


/* =====================================================
   GET EXISTING URL REPORT
===================================================== */

async function getUrlReport(
  url,
  apiKey
) {

  const id =
    toVirusTotalUrlId(url);

  const response =
    await vtFetch(
      `/urls/${encodeURIComponent(id)}`,
      apiKey
    );


  /*
    VirusTotal does not know
    this URL yet.
  */

  if (response.status === 404) {
    return null;
  }


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `VirusTotal report request failed ` +
      `(${response.status}): ` +
      text.slice(0, 200)
    );
  }


  return response.json();
}


/* =====================================================
   SUBMIT NEW URL
===================================================== */

async function submitUrl(
  url,
  apiKey
) {

  const body =
    new URLSearchParams({
      url
    });


  const response =
    await vtFetch(
      "/urls",
      apiKey,
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body
      }
    );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `VirusTotal submit failed ` +
      `(${response.status}): ` +
      text.slice(0, 200)
    );
  }


  const json =
    await response.json();


  return (
    json?.data?.id ||
    null
  );
}


/* =====================================================
   GET ANALYSIS STATUS
===================================================== */

async function getAnalysis(
  id,
  apiKey
) {

  const response =
    await vtFetch(
      `/analyses/${encodeURIComponent(id)}`,
      apiKey
    );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `VirusTotal analysis request failed ` +
      `(${response.status}): ` +
      text.slice(0, 200)
    );
  }


  return response.json();
}


/* =====================================================
   DELAY
===================================================== */

function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );
}


/* =====================================================
   CLEAN VIRUSTOTAL STATISTICS
===================================================== */

function cleanStats(
  stats = {}
) {

  const malicious =
    Number(stats.malicious || 0);

  const suspicious =
    Number(stats.suspicious || 0);

  const harmless =
    Number(stats.harmless || 0);

  const undetected =
    Number(stats.undetected || 0);

  const timeout =
    Number(stats.timeout || 0);

  const failure =
    Number(stats.failure || 0);

  const unsupported =
    Number(
      stats["type-unsupported"] || 0
    );


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


/* =====================================================
   PHISHGUARD RISK SCORE

   IMPORTANT:

   This is NOT a probability.

   22/100 does NOT mean:

   "22% chance this website is malicious."

   It is simply PhishGuard's own risk score.
===================================================== */

function calculateRiskScore(
  stats
) {

  const s =
    cleanStats(stats);


  if (s.total <= 0) {

    return 0;
  }


  /*
    Suspicious detections receive
    half the weight of malicious ones.
  */

  const weightedFlags =

    s.malicious +

    (
      s.suspicious *
      0.5
    );


  /*
    Vendor detection ratio.
  */

  let score =

    Math.round(

      (
        weightedFlags /
        s.total
      ) *

      100
    );


  /* =================================================
     ABSOLUTE MALICIOUS DETECTIONS

     Two isolated detections no longer
     automatically mean HIGH risk.
  ================================================= */


  if (
    s.malicious >= 15
  ) {

    score =
      Math.max(
        score,
        95
      );
  }


  else if (
    s.malicious >= 10
  ) {

    score =
      Math.max(
        score,
        85
      );
  }


  else if (
    s.malicious >= 7
  ) {

    score =
      Math.max(
        score,
        72
      );
  }


  else if (
    s.malicious >= 5
  ) {

    score =
      Math.max(
        score,
        58
      );
  }


  else if (
    s.malicious >= 3
  ) {

    score =
      Math.max(
        score,
        38
      );
  }


  else if (
    s.malicious === 2
  ) {

    score =
      Math.max(
        score,
        22
      );
  }


  else if (
    s.malicious === 1
  ) {

    score =
      Math.max(
        score,
        10
      );
  }


  /* =================================================
     SUSPICIOUS-ONLY DETECTIONS
  ================================================= */


  if (
    s.malicious === 0
  ) {

    if (
      s.suspicious >= 6
    ) {

      score =
        Math.max(
          score,
          35
        );
    }


    else if (
      s.suspicious >= 3
    ) {

      score =
        Math.max(
          score,
          20
        );
    }


    else if (
      s.suspicious >= 1
    ) {

      score =
        Math.max(
          score,
          8
        );
    }
  }


  return Math.max(

    0,

    Math.min(
      100,
      score
    )
  );
}


/* =====================================================
   MAIN VERCEL FUNCTION
===================================================== */

module.exports =
async function handler(
  req,
  res
) {


  /*
    Security reports should not
    be browser/proxy cached.
  */

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  /* =================================================
     METHOD CHECK
  ================================================= */


  if (
    req.method !== "POST"
  ) {

    res.setHeader(
      "Allow",
      "POST"
    );


    return send(
      res,
      405,
      {

        error:
          "Method not allowed. Use POST."
      }
    );
  }


  /* =================================================
     API KEY
  ================================================= */


  const apiKey =

    process.env
      .VIRUSTOTAL_API_KEY;


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


  /* =================================================
     VALIDATE URL
  ================================================= */


  let url;


  try {

    url =
      normalizeUrl(
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


  /* =================================================
     VIRUSTOTAL
  ================================================= */


  try {


    /*
      First try to retrieve
      an existing report.
    */

    let report =

      await getUrlReport(
        url,
        apiKey
      );


    let source =
      "existing_report";


    /* =================================================
       NEW URL
    ================================================= */


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
        Give VirusTotal some time
        to process the submitted URL.
      */

      for (

        let attempt = 0;

        attempt < 4;

        attempt++

      ) {


        await sleep(900);


        const analysis =

          await getAnalysis(
            analysisId,
            apiKey
          );


        const status =

          analysis
            ?.data
            ?.attributes
            ?.status;


        if (
          status === "completed"
        ) {

          break;
        }
      }


      /*
        Retrieve normalized
        URL report.
      */

      report =

        await getUrlReport(
          url,
          apiKey
        );
    }


    /* =================================================
       REPORT NOT READY
    ================================================= */


    if (
      !report
        ?.data
        ?.attributes
    ) {

      return send(
        res,
        202,
        {

          error:

            "VirusTotal accepted the URL, " +
            "but the report is not ready yet. " +
            "Scan again in a few seconds."
        }
      );
    }


    /* =================================================
       RESULTS
    ================================================= */


    const attributes =

      report.data.attributes;


    const stats =

      cleanStats(

        attributes
          .last_analysis_stats ||

        {}
      );


    const riskScore =

      calculateRiskScore(
        stats
      );


    /* =================================================
       RETURN TO FRONTEND
    ================================================= */


    return send(
      res,
      200,
      {

        ok: true,

        source,

        risk_score:
          riskScore,

        /*
          Compatibility with older
          versions of PhishGuard.
        */

        score:
          riskScore,


        /*
          Actual VirusTotal
          verdict counts.
        */

        vt_data:
          stats,


        reputation:

          Number(

            attributes
              .reputation ||

            0
          ),


        last_analysis_date:

          attributes
            .last_analysis_date ||

          null
      }
    );

  }

  catch (err) {


    console.error(

      "PhishGuard analyze error:",

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
