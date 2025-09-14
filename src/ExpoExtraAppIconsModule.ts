import { NativeModulesProxy, requireNativeModule } from "expo-modules-core";
console.log(NativeModulesProxy.ExpoExtraAppIcons);
// It loads the native module object from the JSI or falls back to
// the bridge module (from NativeModulesProxy) if the remote debugger is on.
export default requireNativeModule("ExpoExtraAppIcons");
