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
  <style> body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333;background: #f4f4f4; margin: 0; padding: 10px; } a { color: #007bff; text-decoration: none; } h1, h3, h4, p { margin:0; padding:0; } </style>
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

function reportError(subject, body) {
  const owner = Session.getScriptUser().getEmail();
  try {
    GmailApp.sendEmail(owner, `[Micro-Lessons Script ERROR] ${subject}`, body);
  } catch (e) {
    Logger.log(`[FATAL] Could not even send error report. Error: ${e.message}`);
  }
}
