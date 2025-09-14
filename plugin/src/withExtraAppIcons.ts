import {
  ConfigPlugin,
  ExportedConfigWithProps,
  withDangerousMod,
  withAndroidManifest,
  withXcodeProject,
  AndroidConfig,
  IOSConfig,
  XcodeProject,
} from "@expo/config-plugins";
import { generateImageAsync } from "@expo/image-utils";
import fs from "fs";
import path from "path";
// @ts-ignore

const { getMainApplicationOrThrow, getMainActivityOrThrow } =
  AndroidConfig.Manifest;

const androidFolderPath = ["app", "src", "main", "res"];
const androidFolderNames = [
  "mipmap-hdpi",
  "mipmap-mdpi",
  "mipmap-xhdpi",
  "mipmap-xxhdpi",
  "mipmap-xxxhdpi",
];
const androidSize = [162, 108, 216, 324, 432];

const iosLiquidGlassAppIcons = "AppIcons";

type Platform = "ios" | "android";

type Icon = {
  name: string;
  isMainIcon?: boolean;
  androidForeground: string;
  androidMonochrome: string;
  iosIconFile: string;
  platforms: Platform[];
};

type PluginSettings = {
  expoExtraAppIconsPath: string;
  icons: Icon[];
};

const withExtraAppIcons: ConfigPlugin<PluginSettings> = (
  config,
  props = {
    expoExtraAppIconsPath: "assets/extra-app-icons",
    icons: [],
  },
) => {
  const { expoExtraAppIconsPath, icons } = props;

  const iosIcons = findIconsForPlatform(icons, "ios");

  if (iosIcons.length > 0) {
    config = withIosIcon(config, { expoExtraAppIconsPath, icons: iosIcons });
    config = withXcodeBuildSettings(config, {
      expoExtraAppIconsPath,
      icons: iosIcons,
    });
  }

  //const androidIcons = findIconsForPlatform(prepped, "android");
  //const androidIconsLength = Object.keys(androidIcons).length;
  //if (androidIconsLength > 0) {
  //  config = withIconAndroidManifest(config, { icons: androidIcons });
  //  config = withIconAndroidImages(config, { icons: androidIcons });
  //}
  return config;
};

const findIconsForPlatform = (icons: Icon[], platform: Platform) => {
  return icons.filter((icon) => icon.platforms.includes(platform));
};

// for aos
const withIconAndroidManifest: ConfigPlugin<PluginSettings> = (
  config,
  { icons },
) => {
  return withAndroidManifest(config, (config) => {
    const mainApplication: any = getMainApplicationOrThrow(config.modResults);
    const mainActivity = getMainActivityOrThrow(config.modResults);

    const iconNamePrefix = `${config.android!.package}.MainActivity`;
    const iconNames = Object.keys(icons);

    function addIconActivityAlias(config: any[]): any[] {
      return [
        ...config,
        ...iconNames.map((iconName) => ({
          $: {
            "android:name": `${iconNamePrefix}${iconName}`,
            "android:enabled": "false",
            "android:exported": "true",
            "android:icon": `@mipmap/${iconName}`,
            "android:targetActivity": ".MainActivity",
          },
          "intent-filter": [
            ...(mainActivity["intent-filter"] || [
              {
                action: [
                  { $: { "android:name": "android.intent.action.MAIN" } },
                ],
                category: [
                  { $: { "android:name": "android.intent.category.LAUNCHER" } },
                ],
              },
            ]),
          ],
        })),
      ];
    }
    function removeIconActivityAlias(config: any[]): any[] {
      return config.filter(
        (activityAlias) =>
          !(activityAlias.$["android:name"] as string).startsWith(
            iconNamePrefix,
          ),
      );
    }

    mainApplication["activity-alias"] = removeIconActivityAlias(
      mainApplication["activity-alias"] || [],
    );
    mainApplication["activity-alias"] = addIconActivityAlias(
      mainApplication["activity-alias"] || [],
    );

    return config;
  });
};

const withIconAndroidImages: ConfigPlugin<PluginSettings> = (
  config,
  { icons },
) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const androidResPath = path.join(
        config.modRequest.platformProjectRoot,
        ...androidFolderPath,
      );

      const removeIconRes = async () => {
        for (let i = 0; androidFolderNames.length > i; i += 1) {
          const folder = path.join(androidResPath, androidFolderNames[i]);

          const files = await fs.promises.readdir(folder).catch(() => []);
          for (let j = 0; files.length > j; j += 1) {
            if (!files[j].startsWith("ic_launcher")) {
              await fs.promises
                .rm(path.join(folder, files[j]), { force: true })
                .catch(() => null);
            }
          }
        }
      };
      const addIconRes = async () => {
        for (let i = 0; androidFolderNames.length > i; i += 1) {
          const size = androidSize[i];
          const outputPath = path.join(androidResPath, androidFolderNames[i]);
          for (const [
            name,
            { androidForeground, androidMonochrome },
          ] of Object.entries(icons)) {
            const generateAndSaveImage = async (
              name: string,
              src: string,
              removeTransparency?: boolean,
            ) => {
              const { source } = await generateImageAsync(
                {
                  projectRoot: config.modRequest.projectRoot,
                  cacheType: "react-native-dynamic-app-icon",
                },
                {
                  name,
                  src,
                  removeTransparency,
                  backgroundColor: removeTransparency ? "#FFF" : "transparent",
                  resizeMode: "contain",
                  width: size,
                  height: size,
                },
              );
              await fs.promises.writeFile(path.join(outputPath, name), source);
            };

            const fileName = `${name}-${size}.png`;
            const foregroundFileName = `${name}-${size}_foreground.png`;
            const monochromeFileName = `${name}-${size}_monochrome.png`;

            await generateAndSaveImage(fileName, androidForeground, true);
            await generateAndSaveImage(foregroundFileName, androidForeground);
            await generateAndSaveImage(monochromeFileName, androidMonochrome);
          }
        }
      };

      // fixes the problem with same size from original addIconRes without size in the filename
      const renameIconRes = async () => {
        for (let i = 0; androidFolderNames.length > i; i += 1) {
          for (const name of Object.keys(icons)) {
            const size = androidSize[i];
            const outputPath = path.join(androidResPath, androidFolderNames[i]);

            await fs.promises.rename(
              `${outputPath}/${name}-${size}.png`,
              `${outputPath}/${name}.png`,
            );

            await fs.promises.rename(
              `${outputPath}/${name}-${size}_foreground.png`,
              `${outputPath}/${name}_foreground.png`,
            );

            await fs.promises.rename(
              `${outputPath}/${name}-${size}_monochrome.png`,
              `${outputPath}/${name}_monochrome.png`,
            );
          }
        }
      };

      const addIconXml = async () => {
        for (const name of Object.keys(icons)) {
          const outputPath = path.join(androidResPath, "mipmap-anydpi-v26");
          const content = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
<background android:drawable="@color/iconBackground"/>
<foreground android:drawable="@mipmap/${name}_foreground"/>
<monochrome android:drawable="@mipmap/${name}_monochrome"/>
</adaptive-icon>`;

          await fs.promises.writeFile(
            `${outputPath}/${name}.xml`,
            content.trim(),
          );
        }
      };
      await removeIconRes();
      await addIconRes();
      await renameIconRes();
      await addIconXml();

      return config;
    },
  ]);
};

// for ios

const withIosIcon: ConfigPlugin<PluginSettings> = (config, props) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      await cleanDirAndEnsureDirExists(config);
      await iterateIconsAsync(config, props);
      return config;
    },
  ]);
};

async function cleanDirAndEnsureDirExists(config: ExportedConfigWithProps) {
  const iosRoot = path.join(
    config.modRequest.platformProjectRoot,
    config.modRequest.projectName!,
  );

  // Delete all existing assets
  await fs.promises
    .rm(path.join(iosRoot, iosLiquidGlassAppIcons), {
      recursive: true,
      force: true,
    })
    .catch(() => null);

  // Ensure directory exists
  await fs.promises.mkdir(path.join(iosRoot, iosLiquidGlassAppIcons), {
    recursive: true,
  });
}

async function iterateIconsAsync(
  config: ExportedConfigWithProps,
  props: PluginSettings,
) {
  const { expoExtraAppIconsPath, icons } = props;
  const iosRoot = path.join(
    config.modRequest.platformProjectRoot,
    config.modRequest.projectName!,
  );

  icons.forEach((icon) => {
    if (icon.iosIconFile) {
      const locationPath = path.join(
        config.modRequest.projectRoot,
        expoExtraAppIconsPath,
        icon.iosIconFile,
      );

      const destinationPath = path.join(
        iosRoot,
        iosLiquidGlassAppIcons,
        icon.name + ".icon",
      );

      fs.promises.cp(locationPath, destinationPath, { recursive: true });
    }
  });
}

const getAppTargetUuid = (xcodeProject: XcodeProject, projectName: string) => {
  const nativeTargets = xcodeProject.pbxNativeTargetSection() as {
    name: string;
    [key: string]: any;
  };
  for (const [uuid, target] of Object.entries(nativeTargets)) {
    if (target.name === `"${projectName}"` || target.name === projectName) {
      return uuid;
    }
  }
  throw new Error(`No native target found for project "${projectName}"`);
};

const withXcodeBuildSettings: ConfigPlugin<PluginSettings> = (
  config,
  { icons },
) => {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const iconNames = icons.map((icon) => icon.name);

    const mainIcon = icons.filter((icon) => icon.isMainIcon === true)[0];

    if (!mainIcon) throw new Error("No main icon defined");

    icons.forEach((icon) => {
      IOSConfig.XcodeUtils.addFileToGroupAndLink({
        filepath: path.join(
          config.modRequest.platformProjectRoot,
          config.modRequest.projectName!,
          iosLiquidGlassAppIcons,
          icon.name + ".icon",
        ),
        groupName: config.modRequest.projectName!,
        project: xcodeProject,
        targetUuid: getAppTargetUuid(
          xcodeProject,
          config.modRequest.projectName!,
        ),
        addFileToProject({ project, file }) {
          project.addToPbxFileReferenceSection(file);
          project.addToPbxBuildFileSection(file);
          project.addToPbxResourcesBuildPhase(file);
        },
      });
    });

    xcodeProject.addBuildProperty(
      '"ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES[sdk=*]"',
      `"${iconNames.join(" ")}"`,
    );
    xcodeProject.addBuildProperty(
      "ASSETCATALOG_COMPILER_APPICON_NAME",
      `${mainIcon.name}`,
    );

    return config;
  });
};

export default withExtraAppIcons;
