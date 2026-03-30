const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(//define the OAuth client that will access Gmail's API
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Paste your code here:
const code = "4/0AfrIepCU2uTAGrmuju15Hr1A3bP7tBjm3fBJT487U2arkVTDR2i89uuoKxPlgrusLISZdQ";

async function main() {
  const { tokens } = await oauth2Client.getToken(code);
  console.log("Your refresh token is:", tokens.refresh_token);
}

main().catch(console.error);