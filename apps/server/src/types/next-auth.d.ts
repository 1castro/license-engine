import type { DefaultSession, DefaultUser } from 'next-auth';
import type { AdminRole } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      role?: AdminRole;
    };
  }

  interface User extends DefaultUser {
    role: AdminRole;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: AdminRole;
  }
}
