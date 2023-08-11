import NextAuth from 'next-auth';
import StravaProvider from 'next-auth/providers/strava';

import { config } from "@/utils/config"

const scope =
  [ "activity:read_all"
  ].join(" ");

export default NextAuth({
  providers: [
    StravaProvider({
      clientId: config.STRAVA_CLIENT_ID,
      clientSecret: config.STRAVA_CLIENT_SECRET,
      authorization: {
        params: {scope},
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.id = account.id;
        token.expires_at = account.expires_at;
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = token;
      return session;
    },
  },
});
