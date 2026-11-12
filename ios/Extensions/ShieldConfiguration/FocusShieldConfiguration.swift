import ManagedSettings
import ManagedSettingsUI
import UIKit

final class FocusShieldConfiguration: ShieldConfigurationDataSource {
    private var shield: ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: nil,
            backgroundColor: .systemBackground,
            icon: UIImage(systemName: "pause.circle"),
            title: .init(text: "先说清楚，再打开", color: .label),
            subtitle: .init(text: "请手动返回 Focus，填写用途和时长。", color: .secondaryLabel),
            primaryButtonLabel: .init(text: "知道了", color: .white),
            primaryButtonBackgroundColor: .systemBlue
        )
    }

    override func configuration(shielding application: Application) -> ShieldConfiguration { shield }
    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { shield }
}
