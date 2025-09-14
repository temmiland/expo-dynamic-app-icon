import ExpoModulesCore
import UIKit

/// A native module that allows React Native / Expo apps
/// to dynamically change the iOS application icon at runtime.
public class ExpoExtraAppIconsModule: Module {

  /// Defines the module interface exposed to JavaScript.
  public func definition() -> ModuleDefinition {
    Name("ExpoExtraAppIcons")

    /// Sets the current application icon.
    ///
    /// - Parameter name: The name of the alternate icon as defined in Info.plist.
    ///   Use `"DEFAULT"` to reset back to the primary app icon.
    /// - Returns: The name that was requested (`"DEFAULT"` if resetting).
    Function("setAppIcon") { (name: String) -> String in
      let iconName: String? = (name == "DEFAULT") ? nil : name
      self.setAppIconWithoutAlert(iconName)
      return name
    }

    /// Gets the currently active application icon.
    ///
    /// - Returns: The current alternate icon name, or `"DEFAULT"` if the primary app icon is in use.
    Function("getAppIcon") { () -> String in
      return UIApplication.shared.alternateIconName ?? "DEFAULT"
    }
  }

  /// Sets the application icon without showing a system alert to the user.
  ///
  /// - Parameter iconName: The alternate icon name to set,
  ///   or `nil` to reset to the primary (default) app icon.
  ///
  /// - Note: This uses a private selector (`_setAlternateIconName:completionHandler:`),
  ///   because Apple’s public API normally shows a confirmation alert.
  private func setAppIconWithoutAlert(_ iconName: String?) {
    guard UIApplication.shared.supportsAlternateIcons else {
      return
    }

    typealias SetAlternateIconName = @convention(c) (
      NSObject,
      Selector,
      NSString?,
      @escaping (NSError?) -> Void
    ) -> Void

    let selector = NSSelectorFromString("_setAlternateIconName:completionHandler:")
    guard let imp = UIApplication.shared.method(for: selector) else {
      return
    }

    let method = unsafeBitCast(imp, to: SetAlternateIconName.self)
    method(UIApplication.shared, selector, iconName as NSString?, { _ in })
  }
}
