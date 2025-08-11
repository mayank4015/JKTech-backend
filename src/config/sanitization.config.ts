export interface SanitizationConfig {
  htmlSanitizationEnabled: boolean;
  htmlAllowlist: string[];
  redactFields: string[];
  mongoProtectionEnabled: boolean;
}

export const getSanitizationConfig = (): SanitizationConfig => {
  return {
    htmlSanitizationEnabled: process.env.SANITIZE_HTML !== 'false',
    htmlAllowlist: process.env.SANITIZE_ALLOWLIST
      ? process.env.SANITIZE_ALLOWLIST.split(',').map((tag) => tag.trim())
      : ['b', 'i', 'strong', 'em', 'u', 'br', 'p'],
    redactFields: process.env.REDACT_FIELDS
      ? process.env.REDACT_FIELDS.split(',').map((field) =>
          field.trim().toLowerCase(),
        )
      : [
          'password',
          'passwordhash',
          'refreshtoken',
          'otp',
          'accesstoken',
          'hash',
        ],
    mongoProtectionEnabled: process.env.MONGO_PROTECTION !== 'false',
  };
};
