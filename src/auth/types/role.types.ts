export enum Role {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

export type RoleType = keyof typeof Role;
