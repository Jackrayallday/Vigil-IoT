const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(//define the OAuth client that will access Gmail's API
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const url = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/gmail.send"]
});

console.log("Authorize this app by visiting this URL:", url);