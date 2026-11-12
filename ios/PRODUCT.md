# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Stack

Native SwiftUI, as explicitly requested. Public Family Controls, Managed Settings, Managed Settings UI and Device Activity APIs, with a pure Swift policy package.

## Users and purpose

Chris wants to pause before using selected apps, state a purpose, and request a temporary access window. The prototype must expose actual iOS limits and be testable on a real device.

## Confirmed commitments

- App name Focus; Chinese UI; simple, flat, single-layer layout with no nested cards.
- Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.
- Manual return to Focus and manual target-app return are acceptable.
- No exact five-minute expiry claim, hidden short session, private API, token-based launch, or process killing.
- Independent `ios/` work only. Existing extension code and installed applications remain untouched.

## Evidence and open decisions

The detailed user brief is the product authority. Apple research, actual build/test results and unverified hardware behavior are recorded in `docs/`. This prototype grants the whole selected set per session, explicitly labeled in the UI. It uses 15/30/60-minute monitored windows. Exact enforcement latency remains unknown until measured on a provisioned device.
