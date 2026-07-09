export interface JwtUserPayload {
  sub: string;
  username: string;
  roles: string[];
  permissions: string[];
}

export interface SecurityUserProfile {
  id: number;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  identification: string;
  roles: string[];
  permissions: string[];
}
