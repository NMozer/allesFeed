# Capture-Sheet UI Spec & Components

## Ziel
Floating Plus-Button + modal Bottom Sheet mit 3 Tabs (Voice, Type, Photo) – analog zu Instagram Reels Capture.

## Technischer Stack
- React Native
- @gorhom/bottom-sheet (empfohlen)
- Reanimated 3 + Gesture Handler
- Tamagui oder NativeWind für Styling

## Struktur

### 1. Floating Action Button (FAB)
- Zentriert unten
- Großer + Icon (Reel-Style)
- Long-Press = direkter Voice-Capture
- Short-Press = öffnet Capture-Sheet

### 2. Capture Bottom Sheet
- 3 Tabs oben (Voice | Type | Photo)
- Voice = Default
- Swipe-down zum Schließen

## Komponenten

**CaptureSheet.tsx**
- Verwendet BottomSheetModal
- Tabs mit Gesture

**VoiceCaptureTab.tsx**
- Großer Mic-Button (hold-to-record)
- Live-Transkription Anzeige
- Nach Loslassen: Card Preview + Swipe rechts/links

**TypeCaptureTab.tsx**
- TextInput mit Auto-Parse

**PhotoCaptureTab.tsx**
- Kamera + Galerie

