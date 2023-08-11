import { DefaultSession } from "next-auth";

import { User } from "@/models/user";

export interface Session extends Omit<DefaultSession, "user"> {
  user?: User;
  expires: string;
}
