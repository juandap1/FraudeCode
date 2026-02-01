import { Settings } from "@/config/settings";

export function getInformedSettings() {
  try {
    const settings = Settings.getInstance().get("pluginSettings");
    return settings?.informed || {};
  } catch (error) {
    return {};
  }
}

export function getApiKey(
  key: string,
  envFallback?: string,
): string | undefined {
  const settings = getInformedSettings();
  return (
    settings[key] || (envFallback ? process.env[envFallback] : process.env[key])
  );
}
