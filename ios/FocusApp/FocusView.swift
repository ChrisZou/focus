import Combine
import FamilyControls
import FocusCore
import SwiftUI

struct FocusView: View {
    @ObservedObject var model: FocusModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var typeSize
    @SwiftUI.FocusState private var purposeFocused: Bool
    @State private var purpose = ""
    @State private var minutes = 15
    @State private var pickerPresented = false
    @State private var pickerSelection = FamilyActivitySelection(includeEntireCategory: false)
    @State private var pickerError: String?
    @State private var timingPresented = false
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var validPurpose: Bool { (try? SessionPolicy.validatedPurpose(purpose)) != nil }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 32) {
                    #if targetEnvironment(simulator)
                    Text("模拟器仅验证界面与逻辑；屏蔽需真机验证。")
                        .font(.footnote).foregroundStyle(.secondary)
                    #endif
                    if !model.authorized {
                        authorizationSection
                    } else if model.selectionCount == 0 {
                        Button("选择要屏蔽的 App", systemImage: "plus") { showPicker() }
                            .buttonStyle(.borderedProminent).controlSize(.large)
                    } else if let session = model.state.session, model.hasOpenSession {
                        sessionSection(session)
                    } else {
                        requestSection
                    }
                    if let error = model.errorMessage {
                        Text(error).font(.callout).foregroundStyle(.red)
                            .accessibilityLabel("错误：" + error)
                            .textSelection(.enabled)
                    }
                }
                .frame(maxWidth: 560, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.vertical, 28)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color(uiColor: .systemBackground))
            .navigationTitle("Focus")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if model.authorized {
                        Button("选择 App", systemImage: "square.grid.2x2") { showPicker() }
                            .labelStyle(.iconOnly)
                            .disabled(model.hasOpenSession || model.busy)
                    }
                    Button("计时说明", systemImage: "info.circle") { timingPresented = true }
                        .labelStyle(.iconOnly)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("完成") { purposeFocused = false }
                }
            }
            .sheet(isPresented: $pickerPresented) {
                NavigationStack {
                    VStack(spacing: 0) {
                        if let pickerError {
                            Text(pickerError).font(.callout).foregroundStyle(.red).padding()
                        }
                        FamilyActivityPicker(
                            headerText: "展开分类，选择具体 App。",
                            selection: $pickerSelection
                        )
                    }
                    .navigationTitle("选择 App")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("取消") { pickerPresented = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("保存") {
                                if model.saveSelection(pickerSelection) {
                                    pickerPresented = false
                                } else {
                                    pickerError = model.errorMessage
                                }
                            }
                        }
                    }
                }
            }
            .sheet(isPresented: $timingPresented) { timingExplanation }
            .onReceive(tick) { _ in
                guard scenePhase == .active, model.hasOpenSession else { return }
                // Foreground reconciliation only. This timer does not run a
                // background lease and is never our claimed expiry mechanism.
                model.refresh(allowActivation: true)
            }
            .onReceive(AuthorizationCenter.shared.$authorizationStatus.receive(on: DispatchQueue.main)) { _ in
                // @Published emits in willSet; reconcile after its stored value changes.
                model.refresh()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { model.refresh(allowActivation: true) }
                if phase != .active, model.state.session?.phase == .scheduled {
                    model.cancel()
                }
            }
            .onChange(of: model.state.session?.phase) { _, phase in
                if phase == .active { purpose = "" }
            }
        }
        .tint(.blue)
    }

    private var authorizationSection: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text(model.authorization == .denied ? "屏蔽未启用" : "启用 App 屏蔽")
                .font(.title2.weight(.semibold))
            if model.authorization == .denied {
                Text("屏幕使用时间授权已拒绝或撤销。重新授权后，请再次选择 App。")
                    .font(.body).foregroundStyle(.secondary)
            }
            Button {
                Task { await model.requestAuthorization() }
            } label: {
                if model.busy { ProgressView().frame(maxWidth: .infinity) }
                else { Text("授权屏幕使用时间").frame(maxWidth: .infinity) }
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
            .disabled(model.busy)
            .accessibilityLabel(model.busy ? "正在请求授权" : "授权屏幕使用时间")
        }
    }

    private var requestSection: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 8) {
                Label("已设置屏蔽 \(model.selectionCount) 个 App", systemImage: "lock")
                    .font(.headline)
                if let session = model.state.session {
                    Text(endMessage(session)).font(.callout).foregroundStyle(.secondary)
                }
            }
            Divider()
            VStack(alignment: .leading, spacing: 16) {
                Text("这次打开要做什么？").font(.title2.weight(.semibold))
                TextField("填写用途", text: $purpose, axis: .vertical)
                    .font(.body).lineLimit(2...5)
                    .focused($purposeFocused)
                    .padding(.vertical, 8)
                    .accessibilityLabel("本次用途")
                Divider()
                if purpose.trimmingCharacters(in: .whitespacesAndNewlines).count > SessionPolicy.maximumPurposeLength {
                    Text("用途最多 120 字").font(.callout).foregroundStyle(.red)
                }
            }
            if validPurpose {
                VStack(alignment: .leading, spacing: 16) {
                    if typeSize.isAccessibilitySize {
                        durationPicker.pickerStyle(.menu)
                    } else {
                        durationPicker.pickerStyle(.segmented)
                    }
                    Text("至少 15 分钟，按实际时间计时。系统可能延后恢复屏蔽。")
                        .font(.footnote).foregroundStyle(.secondary)
                    Button {
                        purposeFocused = false
                        model.begin(purpose: purpose, minutes: minutes)
                    } label: {
                        Text("暂时允许全部 \(model.selectionCount) 个 App")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    .disabled(!model.ready)
                }
            }
        }
    }

    private var durationPicker: some View {
        Picker("允许时长", selection: $minutes) {
            ForEach(SessionPolicy.allowedDurationMinutes, id: \.self) { value in
                Text("\(value) 分钟").tag(value)
            }
        }
        .frame(minHeight: 44)
    }

    private func sessionSection(_ session: LeaseSession) -> some View {
        VStack(alignment: .leading, spacing: 28) {
            if session.phase == .scheduled {
                ProgressView("正在准备访问…")
                Text("请保持 Focus 在前台。")
                    .font(.callout).foregroundStyle(.secondary)
            } else {
                Label("临时允许 \(model.selectionCount) 个 App", systemImage: "lock.open")
                    .font(.headline)
                Text(session.purpose).font(.title2.weight(.semibold))
                LabeledContent("计划结束") {
                    Text(session.endsAt, format: .dateTime.hour().minute().second())
                        .monospacedDigit().foregroundStyle(.primary)
                }
                Divider()
                Text("请手动切回目标 App。到期恢复可能延迟；回到 Focus 会核对状态。")
                    .font(.callout).foregroundStyle(.secondary)
            }
            Button(session.phase == .scheduled ? "取消" : "结束并屏蔽") { model.cancel() }
                .buttonStyle(.borderedProminent).controlSize(.large)
        }
    }

    private var timingExplanation: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text("15 分钟起，按钟表计时。离开目标 App 也不会暂停。")
                    Text("iOS 不保证准点恢复屏蔽。锁屏、系统延迟或重启可能影响处理；返回 Focus 会重新核对。重新启动 Focus 会结束未完成的访问。")
                    Text("屏蔽页不能填写用途。请手动打开 Focus；允许后，再手动切回目标 App。")
                }
                .padding(24)
            }
            .navigationTitle("计时说明").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { timingPresented = false }
                }
            }
        }
    }

    private func showPicker() {
        pickerError = nil
        pickerSelection = model.state.selection
        pickerPresented = true
    }

    private func endMessage(_ session: LeaseSession) -> String {
        switch session.phase {
        case .expired: "本次时间已到"
        case .cancelled: "本次访问已结束"
        case .interrupted: "本次访问已中断，请重新申请"
        default: ""
        }
    }
}
