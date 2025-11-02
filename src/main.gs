/**
 * @OnlyCurrentDoc
 * This script generates and sends daily micro-lessons based on specified learning tracks.
 * It fetches real-time trending content, uses AI to create lessons, and sends them via email.
 * It also provides a web-based dashboard to view past lessons.
 */

/* =================================================================
   ======== C O N F I G U R A T I O N ==============================
   ================================================================= */

const CONFIG = {
  TIMEZONE: "America/New_York",
  HISTORY_CSV_NAME: "micro_lessons_history.csv",
  MODEL: {
    NAME: "gpt-4o-mini",
    TEMPERATURE: 0.75,
    MAX_TOKENS: 2500,
  },
  API: {
    OPENAI: "https://api.openai.com/v1/chat/completions",
    NEWS_API: "https://newsapi.org/v2/everything",
    SERP_API: "https://serpapi.com/search.json",
  },
  FETCH_RETRY_POLICY: {
    RETRIES: 3,
    DELAY_MS: 1000,
  },
  CACHE: {
    TRENDING_CONTENT_EXPIRATION_SECONDS: 3 * 60 * 60,
  },
};

const SCRIPT_PROPS = PropertiesService.getScriptProperties();
const OPENAI_KEY = SCRIPT_PROPS.getProperty("OPENAI_API_KEY");
const NEWS_API_KEY = SCRIPT_PROPS.getProperty("NEWS_API_KEY");
const SERP_API_KEY = SCRIPT_PROPS.getProperty("SERP_API_KEY");
const RECIPIENT_EMAIL = SCRIPT_PROPS.getProperty("RECIPIENT_EMAIL");

/* =================================================================
   ======== L E A R N I N G   T R A C K S ==========================
   ================================================================= */

const LEARNING_TRACKS = {
  "Python & Engineering": {
    subtopics: ["Advanced Python patterns", "API development & microservices", "Data pipeline engineering", "Testing & quality assurance", "Performance optimization", "Cloud-native development"],
    searchTerms: ["Python best practices 2025", "FastAPI production", "data engineering Python", "pytest advanced"],
    rssFeeds: ["https://realpython.com/atom.xml", "https://dev.to/feed/tag/python", "https://planet.python.org/rss20.xml"]
  },
  "Data Science & ML": {
    subtopics: ["Statistical modeling techniques", "Machine learning operations", "Deep learning applications", "Causal inference methods", "Time series analysis", "Experiment design & A/B testing"],
    searchTerms: ["machine learning production", "MLOps best practices", "causal ML", "statistical modeling 2025"],
    rssFeeds: ["https://arxiv.org/rss/cs.LG", "https://arxiv.org/rss/stat.ML", "https://blog.research.google/feeds/posts/default"]
  },
  "Business Analytics": {
    subtopics: ["KPI development & measurement", "Customer analytics & segmentation", "Revenue optimization strategies", "Predictive analytics for business", "Marketing analytics & attribution", "Supply chain analytics"],
    searchTerms: ["business analytics trends 2025", "customer analytics platforms", "revenue operations metrics", "data-driven decision making"],
    rssFeeds: ["https://www.forrester.com/blogs/feed/", "https://www.mckinsey.com/insights/rss", "https://sloanreview.mit.edu/feed"]
  },
  "Business Strategy & Management": {
    subtopics: ["Digital transformation initiatives", "Competitive intelligence with data", "Product management & analytics", "Strategic planning with AI", "Change management strategies", "Innovation frameworks"],
    searchTerms: ["digital transformation 2025", "AI business strategy", "data strategy frameworks", "competitive analytics"],
    rssFeeds: ["https://www.forrester.com/blogs/feed/", "https://www.strategy-business.com/rss/all-updates", "https://sloanreview.mit.edu/feed"]
  },
  "Emerging Tech & Trends": {
    subtopics: ["Generative AI applications", "Data mesh & governance", "Real-time analytics platforms", "Privacy-preserving analytics", "Quantum computing basics", "Web3 & blockchain analytics"],
    searchTerms: ["generative AI business", "data mesh implementation", "real-time analytics", "privacy tech 2025"],
    rssFeeds: ["https://feeds.feedburner.com/venturebeat/SZYF", "https://techcrunch.com/feed/", "https://www.theverge.com/rss/index.xml"]
  }
};

/* =================================================================
   ======== C O R E   O R C H E S T R A T I O N ====================
   ================================================================= */

function sendDailyLessons() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    Logger.log("[INFO] Weekend day. Skipping lesson generation.");
    return;
  }

  const today = Utilities.formatDate(now, CONFIG.TIMEZONE, "yyyy-MM-dd");
  Logger.log(`[INFO] Starting lesson generation for ${today}.`);

  const users = getUsers();
  if (!users.length) {
    Logger.log("[WARN] No users found.");
    return;
  }

  for (const user of users) {
    Logger.log(`[INFO] Processing lessons for user: ${user.email}`);
    const lessonsForUser = [];
    
    const dailySchedule = {
      1: ["Python & Engineering", "Business Analytics", "Business Strategy & Management"],
      2: ["Python & Engineering", "Business Analytics", "Data Science & ML"],
      3: ["Python & Engineering", "Business Analytics", "Business Strategy & Management"],
      4: ["Python & Engineering", "Business Analytics", "Data Science & ML"],
      5: ["Python & Engineering", "Business Analytics", "Emerging Tech & Trends"]
    };

    const todaysTracks = dailySchedule[dayOfWeek] || dailySchedule[1];
    const levels = ["Foundational", "Intermediate", "Advanced"];

    for (let i = 0; i < todaysTracks.length; i++) {
      const lesson = generateSingleLesson(todaysTracks[i], levels[i], today);
      if (lesson) lessonsForUser.push(lesson);
    }

    if (lessonsForUser.length > 0) {
      saveToHistory(lessonsForUser);
      sendEnhancedEmail(lessonsForUser, today, user.email);
    } else {
      Logger.log(`[WARN] No lessons were generated for ${user.email}.`);
      reportError("Zero Lessons Generated", `Failed to generate any lessons for ${user.email} on ${today}.`);
    }
  }
}

function generateSingleLesson(track, level, date) {
  const trackConfig = LEARNING_TRACKS[track];
  if (!trackConfig) {
    Logger.log(`[ERROR] Invalid track: ${track}`);
    return null;
  }

  const subtopic = getNextSubtopic(track, trackConfig.subtopics);
  Logger.log(`[INFO] Generating ${level} lesson for [${track} > ${subtopic}]`);

  try {
    const trendingContent = getTrendingContent(track, trackConfig.searchTerms, trackConfig.rssFeeds);
    const lesson = generateEnhancedLesson(track, subtopic, level, trendingContent);
    Logger.log(`[SUCCESS] Generated lesson: "${lesson.title}" (${lesson.wordCount} words)`);
    return { date, track, subtopic, level, ...lesson };
  } catch (error) {
    Logger.log(`[ERROR] Primary generation failed for ${track}: ${error}. Attempting fallback.`);
    try {
      const fallbackContent = { trends: getCuratedTrends(track), insights: getFallbackInsights(track) };
      const lesson = generateEnhancedLesson(track, subtopic, level, fallbackContent);
      Logger.log(`[SUCCESS] Generated lesson with fallback: "${lesson.title}"`);
      return { date, track, subtopic, level, ...lesson };
    } catch (fallbackError) {
      Logger.log(`[ERROR] Fallback generation also failed for ${track}: ${fallbackError}`);
      reportError(`Total Lesson Failure: ${track}`, `Primary: ${error}\nFallback: ${fallbackError}`);
      return null;
    }
  }
}

/* =================================================================
   ======== U S E R   M A N A G E M E N T ==========================
   ================================================================= */

function getUsers() {
  const primaryRecipient = RECIPIENT_EMAIL || Session.getActiveUser().getEmail();
  if (!primaryRecipient) return [];
  return [{ email: primaryRecipient }];
}

/* =================================================================
   ======== C O N T E N T   A C Q U I S I T I O N ==================
   ================================================================= */

function getNextSubtopic(trackName, subtopics) {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const index = dayOfYear % subtopics.length;
  return subtopics[index];
}

function getTrendingContent(track, searchTerms, rssFeeds) {
  const cacheKey = `trending_content_${track.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const cached = SimpleCache.get(cacheKey);
  if (cached) {
    Logger.log(`[INFO] Using cached trending content for track: ${track}`);
    return cached;
  }

  Logger.log(`[INFO] Fetching fresh trending content for track: ${track}`);
  const articles = [];
  
  for (const term of searchTerms.slice(0, 2)) {
    articles.push(...(fetchFromNewsAPI(term) || []));
    articles.push(...(fetchFromSerpAPI(term) || []));
  }
  
  for (const feedUrl of (rssFeeds || []).slice(0, 2)) {
    articles.push(...(fetchFromRSS(feedUrl) || []));
  }

  const uniqueArticles = Array.from(new Map(articles.map(a => [a.url, a])).values());
  
  let content;
  if (uniqueArticles.length > 0) {
    content = {
      trends: extractTrends(uniqueArticles),
      insights: uniqueArticles.slice(0, 3).map(a => ({
        headline: a.title, takeaway: a.description || a.snippet || "", source: a.source || "Web"
      }))
    };
  } else {
    Logger.log(`[WARN] No articles found for ${track}. Using curated fallback.`);
    content = { trends: getCuratedTrends(track), insights: getFallbackInsights(track) };
  }

  SimpleCache.put(cacheKey, content, CONFIG.CACHE.TRENDING_CONTENT_EXPIRATION_SECONDS);
  return content;
}

function fetchFromNewsAPI(query) {
  if (!NEWS_API_KEY) return null;
  const url = `${CONFIG.API.NEWS_API}?q=${encodeURIComponent(query)}&sortBy=relevancy&language=en&pageSize=5&apiKey=${NEWS_API_KEY}`;
  try {
    const response = fetchWithRetry(url);
    if (response) {
      const data = JSON.parse(response.getContentText());
      return data.articles.map(a => ({
        title: a.title, description: a.description, url: a.url,
        source: a.source.name, publishedAt: a.publishedAt
      }));
    }
  } catch (e) {
    Logger.log(`[ERROR] NewsAPI fetch error: ${e.message}`);
  }
  return null;
}

function fetchFromSerpAPI(query) {
  if (!SERP_API_KEY) return null;
  const url = `${CONFIG.API.SERP_API}?q=${encodeURIComponent(query)}&api_key=${SERP_API_KEY}&num=5`;
  try {
    const response = fetchWithRetry(url);
    if (response) {
      const data = JSON.parse(response.getContentText());
      return data.organic_results?.map(r => ({
        title: r.title, snippet: r.snippet, url: r.link, date: r.date
      }));
    }
  } catch (e) {
    Logger.log(`[ERROR] SerpAPI fetch error: ${e.message}`);
  }
  return null;
}

function fetchFromRSS(feedUrl) {
  try {
    const response = fetchWithRetry(feedUrl, { followRedirects: true, validateHttpsCertificates: false });
    if (response) {
      const xml = XmlService.parse(response.getContentText());
      const root = xml.getRootElement();
      const ns = root.getNamespace();
      let items = [];

      if (root.getName() === 'rss') {
        items = root.getChild('channel')?.getChildren('item') || [];
        return items.slice(0, 5).map(item => ({
          title: item.getChildText('title'), description: item.getChildText('description'),
          url: item.getChildText('link'), pubDate: item.getChildText('pubDate')
        })).filter(item => item.title);
      } else if (root.getName() === 'feed') {
        items = root.getChildren('entry', ns);
        return items.slice(0, 5).map(item => ({
          title: item.getChildText('title', ns),
          description: item.getChildText('summary', ns) || item.getChildText('content', ns),
          url: item.getChild('link', ns)?.getAttribute('href')?.getValue(),
          pubDate: item.getChildText('published', ns) || item.getChildText('updated', ns)
        })).filter(item => item.title);
      }
    }
  } catch (e) {
    Logger.log(`[ERROR] RSS fetch/parse error for ${feedUrl}: ${e.message}`);
  }
  return null;
}

/* =================================================================
   ======== C O N T E N T   A N A L Y S I S ========================
   ================================================================= */

function extractTrends(articles) {
  const keywords = {};
  const commonTerms = ["ai", "automation", "analytics", "cloud", "real-time", "privacy", "governance", "transformation", "optimization", "platform", "framework", "strategy"];
  articles.forEach(article => {
    const text = `${article.title} ${article.description || article.snippet || ""}`.toLowerCase();
    commonTerms.forEach(term => {
      if (text.includes(term)) keywords[term] = (keywords[term] || 0) + 1;
    });
  });
  return Object.entries(keywords).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([term]) => term);
}

function getCuratedTrends(track) {
  const trends = { "Business Analytics": ["Self-service analytics", "Real-time decision intelligence", "Composite AI"], "Data Science & ML": ["AutoML", "Explainable AI (XAI)", "Edge ML"], "Python & Engineering": ["Rust + Python", "Async-first design", "Infrastructure as Code (IaC)"] };
  return trends[track] || ["Generative AI", "Zero-trust architecture", "Data Mesh"];
}

function getFallbackInsights(track) {
  return [
    { headline: "Industry report shows 40% AI adoption increase", takeaway: "Firms using AI see average 15% efficiency gains.", source: "Analysis" },
    { headline: "New framework reduces implementation time", takeaway: "A modular approach accelerates time-to-value.", source: "Tech Report" },
    { headline: "Study reveals success factors for data projects", takeaway: "Executive sponsorship and clear metrics are critical.", source: "Research" }
  ];
}

/* =================================================================
   ======== A I   L E S S O N   G E N E R A T I O N ================
   ================================================================= */

function generateEnhancedLesson(track, subtopic, level, trendingContent) {
  if (!OPENAI_KEY) throw new Error("Missing OPENAI_API_KEY");

  const targets = { "Foundational": { min: 350, max: 450 }, "Intermediate": { min: 400, max: 500 }, "Advanced": { min: 450, max: 550 } };
  const target = targets[level];
  const trendContext = `Recent developments:\n${trendingContent.insights.map(i => `- ${i.headline}: ${i.takeaway}`).join('\n')}`;
  const systemPrompt = `You are a world-class educator creating micro-lessons. Be concise, practical, and focus on actionable insights.`;
  const userPrompt = `Create a ${level} micro-lesson for track "${track}" on subtopic "${subtopic}". Context: ${trendContext}. Trending themes: ${trendingContent.trends.join(", ")}. Return JSON with this EXACT structure: {"title": "Actionable Title", "hook": "Compelling intro sentence.", "tags": ["tag1","tag2"], "content": {"The Situation": "80-100 words", "Core Framework": {"overview": "60-80 words", "components": ["C1", "C2", "C3"]}, "Real Implementation": {"scenario": "100-120 words", "results": "60-80 words"}, "Critical Considerations": ["Risk 1", "Risk 2"], "Action Item": "One specific, immediate task.", "Bottom Line": "One key insight to remember."}, "metadata": {"track": "${track}", "difficulty": "${level}"}} Requirements: Total ${target.min}-${target.max} words. Include 3+ metrics (%, $, time). Use a real company example.`;
  
  const response = callOpenAI(systemPrompt, userPrompt);
  return formatEnhancedLesson(response, track);
}

function callOpenAI(system, user) {
  const payload = {
    model: CONFIG.MODEL.NAME, messages: [{ role: "system", content: system }, { role: "user", content: user }],
    temperature: CONFIG.MODEL.TEMPERATURE, max_tokens: CONFIG.MODEL.MAX_TOKENS, response_format: { type: "json_object" }
  };
  const options = { method: "post", headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, payload: JSON.stringify(payload) };
  const response = fetchWithRetry(CONFIG.API.OPENAI, options);
  if (!response) throw new Error("OpenAI API call failed after retries.");
  return JSON.parse(JSON.parse(response.getContentText()).choices[0].message.content);
}

/* =================================================================
   ======== F O R M A T T I N G   &   D E L I V E R Y ==============
   ================================================================= */

function formatEnhancedLesson(data, track) {
  const content = data.content;
  const allText = Object.values(content).map(v => typeof v === 'string' ? v : Object.values(v).flat().join(' ')).join(' ');
  const wordCount = allText.split(/\s+/).filter(Boolean).length;

  const html = `
    <p style="font-style: italic; color: #555; margin: 10px 0; border-left: 3px solid #007bff; padding-left: 10px;">${data.hook}</p>
    <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 15px 0;">
      <h4 style="margin-top: 0; color: #004aad;">📊 The Situation</h4><p>${content["The Situation"]}</p>
    </div>
    <h4 style="color: #004aad;">🎯 Core Framework</h4><p>${content["Core Framework"].overview}</p>
    <ul style="padding-left: 20px;">${content["Core Framework"].components.map(c => `<li>${c}</li>`).join("")}</ul>
    <div style="background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; padding: 15px; margin: 15px 0;">
      <h4 style="margin-top: 0; color: #004aad;">💼 Real Implementation</h4>
      <p><strong>Scenario:</strong> ${content["Real Implementation"].scenario}</p>
      <p><strong>Results:</strong> ${content["Real Implementation"].results}</p>
    </div>
    <h4 style="color: #004aad;">⚠️ Critical Considerations</h4><ul>${content["Critical Considerations"].map(c => `<li>${c}</li>`).join("")}</ul>
    <div style="background: #e6f7ff; border-left: 4px solid #007bff; padding: 15px; margin: 15px 0; border-radius: 4px;">
      <h4 style="margin-top: 0; color: #004aad;">🚀 Action Item</h4><p>${content["Action Item"]}</p>
    </div>
    <div style="background: #004aad; color: white; padding: 12px; border-radius: 8px; margin: 15px 0;">
      <h4 style="margin: 0 0 5px 0; color: white;">💡 Bottom Line</h4><p style="margin: 0;">${content["Bottom Line"]}</p>
    </div>`;
  
  return { title: data.title, tags: data.tags || [], content: html, wordCount: wordCount, metadata: data.metadata, track: track };
}

function sendEnhancedEmail(lessons, date, recipient) {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[new Date().getDay()];
  const dashboardUrl = ScriptApp.getService().getUrl();

  const lessonHtmlContent = lessons.map((lesson, index) => `
    <tr><td style="padding: 25px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff;">
      <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 20px;">
        <h3 style="color: #1e293b; margin: 0 0 10px 0; font-size: 20px; font-weight: 600;">Lesson ${index + 1}: ${lesson.title}</h3>
        <p style="color: #64748b; font-size: 14px; margin: 5px 0;">📂 ${lesson.track} › ${lesson.subtopic}</p>
      </div>
      ${lesson.content}
    </td></tr>
    <tr><td style="height: 25px;"></td></tr>
  `).join("");

  const html = `
  <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style> body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; margin: 0; padding: 10px; } a { color: #007bff; text-decoration: none; } h1, h3, h4, p { margin:0; padding:0; } </style>
  </head><body style="margin:0;padding:0;background-color:#f4f4f4;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f4f4f4;"><tr><td align="center">
  <table width="600" border="0" cellspacing="0" cellpadding="20" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #ddd;">
    <tr><td align="center" style="background-color: #004aad; color: #ffffff; padding: 20px; border-radius: 8px 8px 0 0;">
      <h1 style="font-size: 24px;">📚 Daily Micro-Lessons</h1>
      <p style="margin-top: 5px; font-size: 16px;">${dayName}, ${date}</p>
    </td></tr>
    <tr><td style="height: 20px;"></td></tr>
    ${lessonHtmlContent}
    <tr><td align="center" style="border-top: 1px solid #e2e8f0; padding-top: 20px;">
      <p><a href="${dashboardUrl}">View Dashboard</a> | <a href="mailto:${recipient}?subject=Micro-Lessons%20Feedback">Send Feedback</a></p>
    </td></tr>
  </table>
  </td></tr></table>
  </body></html>`;

  try {
    GmailApp.sendEmail(recipient, `📚 Today's 3 Micro-Lessons: ${lessons.map(l => l.track.split(" ")[0]).join(", ")}`, "Please view in HTML.", { htmlBody: html });
    Logger.log(`[INFO] Email successfully dispatched to ${recipient}.`);
  } catch (e) {
    Logger.log(`[ERROR] Failed to send email to ${recipient}: ${e.message}`);
    reportError(`Email Send Failure to ${recipient}`, e.message);
  }
}


/* =================================================================
   ======== S T O R A G E ==========================================
   ================================================================= */

function saveToHistory(lessons) {
  const files = DriveApp.getFilesByName(CONFIG.HISTORY_CSV_NAME);
  let file;
  if (files.hasNext()) {
    file = files.next();
  } else {
    file = DriveApp.createFile(CONFIG.HISTORY_CSV_NAME, "Date,Topic,Level,Title,Tags,WordCount,Content\n", MimeType.CSV);
  }
  const rows = lessons.map(l => [l.date, l.track, l.level, l.title, l.tags.join(","), l.wordCount, l.content].map(csvEscape).join(","));
  const currentContent = file.getBlob().getDataAsString();
  file.setContent(currentContent + rows.join("\n") + "\n");
  Logger.log(`[INFO] Saved ${lessons.length} lessons to ${CONFIG.HISTORY_CSV_NAME}`);
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}


/* =================================================================
   ======== U T I L I T I E S   &   A D M I N ======================
   ================================================================= */

const SimpleCache = {
  get: (key) => { try { const v = CacheService.getScriptCache().get(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  put: (key, v, exp) => { try { CacheService.getScriptCache().put(key, JSON.stringify(v), exp); } catch (e) {} }
};

function fetchWithRetry(url, options = {}) {
  const { RETRIES, DELAY_MS } = CONFIG.FETCH_RETRY_POLICY;
  options.muteHttpExceptions = true;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) return response;
      Logger.log(`[WARN] Attempt ${i + 1}/${RETRIES}: Request to ${url} failed with status ${response.getResponseCode()}. Retrying...`);
    } catch (e) {
      Logger.log(`[WARN] Attempt ${i + 1}/${RETRIES}: Request to ${url} failed with error: ${e.message}. Retrying...`);
    }
    if (i < RETRIES - 1) Utilities.sleep(DELAY_MS * Math.pow(2, i));
  }
  Logger.log(`[ERROR] All ${RETRIES} attempts to fetch ${url} failed.`);
  return null;
}

function reportError(subject, body) {
  const owner = Session.getScriptUser().getEmail();
  try {
    GmailApp.sendEmail(owner, `[Micro-Lessons Script ERROR] ${subject}`, body);
  } catch (e) {
    Logger.log(`[FATAL] Could not even send error report. Error: ${e.message}`);
  }
}

function manualRun() { sendDailyLessons(); }

function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === "sendDailyLessons") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sendDailyLessons").timeBased().atHour(7).everyDays(1).create();
  Logger.log("Daily trigger set for 7:00 AM.");
}

function clearCache() {
  const trackNames = Object.keys(LEARNING_TRACKS);
  const keysToRemove = trackNames.map(track => `trending_content_${track.replace(/[^a-zA-Z0-9]/g, '_')}`);
  if (keysToRemove.length > 0) {
    CacheService.getScriptCache().removeAll(keysToRemove);
    Logger.log(`Cache cleared for keys: ${trackNames.join(', ')}`);
  }
}

function clearAllLessons() {
  const files = DriveApp.getFilesByName(CONFIG.HISTORY_CSV_NAME);
  if (files.hasNext()) {
    files.next().setContent("Date,Topic,Level,Title,Tags,WordCount,Content\n");
    Logger.log(`Cleared all lessons from ${CONFIG.HISTORY_CSV_NAME}`);
  }
}


/* =================================================================
   ======== W E B   A P P   /   D A S H B O A R D ==================
   ================================================================= */

function doGet() {
  return HtmlService.createHtmlOutputFromFile("dashboard")
    .setTitle("Micro-Lessons Dashboard")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getDashboardData() {
  const files = DriveApp.getFilesByName(CONFIG.HISTORY_CSV_NAME);
  const defaultData = {
    dates: [], byDate: {}, topics: Object.keys(LEARNING_TRACKS),
    levels: ["Foundational", "Intermediate", "Advanced"], topicTotals: {},
    topicCoverage: {}, weakest: [], timezone: CONFIG.TIMEZONE,
    canonicalToday: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd")
  };
  if (!files.hasNext()) return defaultData;
  const rows = Utilities.parseCsv(files.next().getBlob().getDataAsString());
  if (rows.length <= 1) return defaultData;

  const dataRows = rows.slice(1);
  const byDate = {};
  dataRows.forEach(row => {
    const date = row[0]; if (!date) return;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(row);
  });

  const dates = Object.keys(byDate).sort().reverse();
  return { ...defaultData, dates, byDate };
}

function generateDeepDivePrompt(title, track, subtopic) {
  return `
    Act as an expert educator. I've just completed a micro-lesson titled "${title}" in my "${track}" learning track, focusing on "${subtopic}".

    Please provide a deep-dive explanation that expands on this topic. Structure your response in three parts:
    
    1.  **Core Concept Revisited:** Briefly explain the absolute most critical concept from the lesson in a new and insightful way. Use an analogy if possible.
    2.  **Advanced Application:** Describe a more complex, real-world scenario where this concept is applied. Include specific metrics and potential challenges.
    3.  **Contrarian Viewpoint:** Discuss a common critique, limitation, or alternative approach to the main idea presented in the lesson.
    
    Keep the entire response under 400 words and maintain a professional, engaging tone.
  `;
}


