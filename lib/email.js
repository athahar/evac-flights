function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildOfferLine(offer) {
  const route = `${offer.origin} -> ${offer.destination}`;
  const airline = offer.ownerName || offer.ownerCode || "Unknown airline";
  const depart = offer.departAt || "Unknown time";
  const price = offer.totalAmount ? `${offer.totalAmount} ${offer.totalCurrency || ""}`.trim() : "Price unavailable";
  return `${airline} | ${route} | ${depart} | ${price}`;
}

function buildHtml(offers, meta) {
  const rows = offers
    .map((offer) => {
      const airline = escapeHtml(offer.ownerName || offer.ownerCode || "Unknown airline");
      const route = escapeHtml(`${offer.origin} -> ${offer.destination}`);
      const depart = escapeHtml(offer.departAt || "Unknown");
      const price = escapeHtml(
        offer.totalAmount ? `${offer.totalAmount} ${offer.totalCurrency || ""}`.trim() : "Price unavailable"
      );

      return `<tr>
        <td style="padding:8px;border:1px solid #ddd;">${airline}</td>
        <td style="padding:8px;border:1px solid #ddd;">${route}</td>
        <td style="padding:8px;border:1px solid #ddd;">${depart}</td>
        <td style="padding:8px;border:1px solid #ddd;">${price}</td>
      </tr>`;
    })
    .join("\n");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;">
      <h2>Evac Flight Alert</h2>
      <p>New matching offers found.</p>
      <p>
        Origins: ${escapeHtml(meta.origins.join(", "))}<br>
        Departure Date: ${escapeHtml(meta.departureDate)}<br>
        New Matches: ${offers.length}
      </p>
      <table style="border-collapse:collapse; width:100%;">
        <thead>
          <tr>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Airline</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Route</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Departure</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="margin-top:16px;color:#666;font-size:12px;">
        This is an automated alert from evac-flight-alert v0.
      </p>
    </div>
  `;
}

export async function sendAlertEmail(config, offers, meta) {
  const subject = `Evac Alert: ${offers.length} new offer(s) | ${meta.origins.join(", ")} | ${meta.departureDate}`;
  const text = [
    "New matching flight offers found:",
    "",
    ...offers.map((offer, idx) => `${idx + 1}. ${buildOfferLine(offer)}`),
    "",
    `Origins: ${meta.origins.join(", ")}`,
    `Departure Date: ${meta.departureDate}`
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.alertEmailFrom,
      to: [config.alertEmailTo],
      subject,
      text,
      html: buildHtml(offers, meta)
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = payload?.message || `Resend error ${response.status}`;
    throw new Error(msg);
  }

  return payload;
}

function buildFeedbackHtml(payload) {
  const submittedAt = escapeHtml(payload.submittedAt || "");
  const origin = escapeHtml(payload.origin || "-");
  const currency = escapeHtml(payload.currency || "-");
  const page = escapeHtml(payload.page || "-");
  const userAgent = escapeHtml(payload.userAgent || "-");
  const message = escapeHtml(payload.message || "").replaceAll("\n", "<br>");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;">
      <h2>Flight Board Feedback</h2>
      <p><strong>Submitted at:</strong> ${submittedAt}</p>
      <p><strong>Selected tab:</strong> ${origin}</p>
      <p><strong>Currency view:</strong> ${currency}</p>
      <p><strong>Page:</strong> ${page}</p>
      <p><strong>User agent:</strong> ${userAgent}</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;">
      <p style="white-space:normal;">${message || "(empty)"}</p>
    </div>
  `;
}

export async function sendFeedbackEmail(config, payload) {
  const subject = `Flight board feedback (${payload.origin || "unknown"})`;
  const text = [
    "Flight board feedback",
    "",
    `Submitted at: ${payload.submittedAt || ""}`,
    `Selected tab: ${payload.origin || "-"}`,
    `Currency view: ${payload.currency || "-"}`,
    `Page: ${payload.page || "-"}`,
    `User agent: ${payload.userAgent || "-"}`,
    "",
    "Message:",
    payload.message || "(empty)"
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.alertEmailFrom,
      to: [config.alertEmailTo],
      subject,
      text,
      html: buildFeedbackHtml(payload)
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = body?.message || `Resend error ${response.status}`;
    throw new Error(msg);
  }

  return body;
}
