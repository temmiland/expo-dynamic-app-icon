import ExpoExtraAppIconsModule from "./ExpoExtraAppIconsModule";

export function setAppIcon(name: string): string | false {
  return ExpoExtraAppIconsModule.setAppIcon(name);
}

export function getAppIcon(): string {
  return ExpoExtraAppIconsModule.getAppIcon();
}
