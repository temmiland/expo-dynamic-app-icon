import {
  ConfigPlugin,
  ExportedConfigWithProps,
  withDangerousMod,
  withAndroidManifest,
  withXcodeProject,
  AndroidConfig,
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

const iosFolderName = "Images.xcassets/DynamicAppIcons";
const iosSize = 1024;

type Platform = "ios" | "android";

type Icon = {
  image: string;
  androidImageMonochrome: string;
  iosImageDark: string;
  iosImageTinted: string;
  prerendered?: boolean;
  platforms?: Platform[];
};

type IconSet = Record<string, Icon>;

type Props = {
  icons: Record<string, Icon>;
};

function arrayToImages(images: string[]) {
  return images.reduce(
    (prev, curr, i) => ({ ...prev, [i]: { image: curr } }),
    {},
  );
}

const findIconsForPlatform = (icons: IconSet, platform: Platform) => {
  return Object.keys(icons)
    .filter((key) => {
      const icon = icons[key];
      if (icon.platforms) {
        return icon["platforms"].includes(platform);
      }
      return true;
    })
    .reduce((prev, curr) => ({ ...prev, [curr]: icons[curr] }), {});
};

const withDynamicIcon: ConfigPlugin<string[] | IconSet | void> = (
  config,
  props = {},
) => {
  const _props = props || {};

  let prepped: Props["icons"] = {};

  if (Array.isArray(_props)) {
    prepped = arrayToImages(_props);
  } else if (_props) {
    prepped = _props;
  }

  const iOSIcons = findIconsForPlatform(prepped, "ios");
  const iOSIconsLength = Object.keys(iOSIcons).length;
  if (iOSIconsLength > 0) {
    config = withIconIosImages(config, { icons: iOSIcons });
    config = withXcodeBuildSettings(config, { icons: iOSIcons });
  }
  const androidIcons = findIconsForPlatform(prepped, "android");
  const androidIconsLength = Object.keys(androidIcons).length;
  if (androidIconsLength > 0) {
    config = withIconAndroidManifest(config, { icons: androidIcons });
    config = withIconAndroidImages(config, { icons: androidIcons });
  }
  return config;
};

// for aos
const withIconAndroidManifest: ConfigPlugin<Props> = (config, { icons }) => {
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

const withIconAndroidImages: ConfigPlugin<Props> = (config, { icons }) => {
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
            { image, androidImageMonochrome },
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

            await generateAndSaveImage(fileName, image, true);
            await generateAndSaveImage(foregroundFileName, image);
            await generateAndSaveImage(
              monochromeFileName,
              androidImageMonochrome,
            );
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
          const content = `
<?xml version="1.0" encoding="utf-8"?>
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

function getIconName(name: string, size: number) {
  return `${name}-Icon-${size}x${size}`;
}

const withXcodeBuildSettings: ConfigPlugin<Props> = (config, { icons }) => {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;

    xcodeProject.addBuildProperty(
      '"ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES[sdk=*]"',
      `"${Object.keys(icons).join(" ")}"`,
    );

    return config;
  });
};

const withIconIosImages: ConfigPlugin<Props> = (config, props) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      await createIconsAsync(config, props);
      return config;
    },
  ]);
};

async function createIconsAsync(
  config: ExportedConfigWithProps,
  { icons }: Props,
) {
  const iosRoot = path.join(
    config.modRequest.platformProjectRoot,
    config.modRequest.projectName!,
  );

  // Delete all existing assets
  await fs.promises
    .rm(path.join(iosRoot, iosFolderName), { recursive: true, force: true })
    .catch(() => null);
  // Ensure directory exists
  await fs.promises.mkdir(path.join(iosRoot, iosFolderName), {
    recursive: true,
  });

  const content: {
    images: {
      appearances?: {
        appearance: string;
        value: string;
      }[];
      filename: string;
      idiom: string;
      platform: string;
      size: string;
    }[];
    info: {
      author: string;
      version: number;
    };
  } = {
    images: [],
    info: {
      author: "xcode",
      version: 1,
    },
  };

  // Generate new assets
  await iterateIconsAsync({ icons }, async (key, icon) => {
    content.images = [];
    // Delete all existing assets
    await fs.promises
      .rm(path.join(iosRoot, `${iosFolderName}/${key}.appiconset`), {
        recursive: true,
        force: true,
      })
      .catch(() => null);
    // Ensure directory exists
    await fs.promises.mkdir(
      path.join(iosRoot, `${iosFolderName}/${key}.appiconset`),
      {
        recursive: true,
      },
    );
    const platform = "ios";
    const size = `${iosSize}x${iosSize}`;

    const iconVariants = [
      {
        src: icon.image,
        filename: getIconName(key, iosSize) + ".png",
        appearances: [],
        removeTransparency: true,
        backgroundColor: "#ffffff",
      },
      {
        src: icon.iosImageDark,
        filename: getIconName(key, iosSize) + "_dark.png",
        appearances: [{ appearance: "luminosity", value: "dark" }],
        removeTransparency: false,
        backgroundColor: "transparent",
      },
      {
        src: icon.iosImageTinted,
        filename: getIconName(key, iosSize) + "_tinted.png",
        appearances: [{ appearance: "luminosity", value: "tinted" }],
        removeTransparency: false,
        backgroundColor: "transparent",
      },
    ];

    for (const variant of iconVariants) {
      const {
        src,
        filename,
        appearances,
        removeTransparency,
        backgroundColor,
      } = variant;
      const { source } = await generateImageAsync(
        {
          projectRoot: config.modRequest.projectRoot,
          cacheType: "react-native-dynamic-app-icon",
        },
        {
          name: filename,
          src,
          removeTransparency,
          backgroundColor,
          resizeMode: "cover",
          width: iosSize,
          height: iosSize,
        },
      );
      content.images.push({
        ...(appearances.length ? { appearances } : {}),
        filename,
        idiom: "universal",
        platform,
        size,
      });
      await fs.promises.writeFile(
        path.join(iosRoot, `${iosFolderName}/${key}.appiconset`, filename),
        source,
      );
    }
    await fs.promises.writeFile(
      path.join(iosRoot, `${iosFolderName}/${key}.appiconset/Contents.json`),
      JSON.stringify(content),
    );
  });
}

async function iterateIconsAsync(
  { icons }: Props,
  callback: (key: string, icon: any, index: number) => Promise<void>,
) {
  const entries = Object.entries(icons);
  for (let i = 0; i < entries.length; i++) {
    const [key, val] = entries[i];

    await callback(key, val, i);
  }
}

export default withDynamicIcon;
