// global.d.ts (should be added somewhere in your project)

interface TranslationDetectorResult {
  detectedLanguage: string;
  confidence: number;
}

interface Translation {
  createDetector: () => Promise<{
    detect: (text: string) => Promise<TranslationDetectorResult[]>;
  }>;
  createTranslator?: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<{
    translate: (text: string) => Promise<string>;
  }>;
}

interface Window {
  translation: Translation;
}

// Your existing script

(async () => {
  // Check if translation API is available
  if (!("translation" in self) || !("createDetector" in self.translation)) {
    const notSupportedMessage = document.querySelector(
      ".not-supported-message"
    ) as HTMLElement;
    notSupportedMessage.hidden = false;
    return;
  }

  const input = document.querySelector("textarea") as HTMLTextAreaElement;
  const output = document.querySelector("output") as HTMLElement;
  const form = document.querySelector("form") as HTMLFormElement;
  const detected = document.querySelector("span") as HTMLElement;
  const language = document.querySelector("select") as HTMLSelectElement;

  form.style.visibility = "visible";

  // Assuming self.translation.createDetector() returns a valid detector object with a detect method
  const detector = await self.translation.createDetector();

  // Event listener for input
  input.addEventListener("input", async () => {
    if (!input.value.trim()) {
      detected.textContent = "not sure what language this is";
      return;
    }
    const result = await detector.detect(input.value.trim());
    const { detectedLanguage, confidence } = result[0];
    detected.textContent = `${(confidence * 100).toFixed(
      1
    )}% sure that this is ${languageTagToHumanReadable(
      detectedLanguage,
      "en"
    )}`;
  });

  // Trigger an input event to populate the initial detection
  input.dispatchEvent(new Event("input"));

  // Function to convert language tag to human-readable format
  const languageTagToHumanReadable = (
    languageTag: string,
    targetLanguage: string
  ): string => {
    const displayNames = new Intl.DisplayNames([targetLanguage], {
      type: "language",
    });
    return displayNames.of(languageTag) || "";
  };

  // Check if translation functionality is available
  if ("createTranslator" in self.translation) {
    // Show the form if translation functionality is supported
    document
      .querySelectorAll("[hidden]:not(.not-supported-message)")
      .forEach((el) => {
        el.removeAttribute("hidden");
      });

    // Handle form submission
    form.addEventListener("submit", async (e: Event) => {
      e.preventDefault();
      try {
        const result = await detector.detect(input.value.trim());
        const sourceLanguage = result[0].detectedLanguage;
        if (!["en", "ja", "es"].includes(sourceLanguage)) {
          output.textContent =
            "Currently, only English ↔ Spanish and English ↔ Japanese are supported.";
          return;
        }
        const translator = await self.translation.createTranslator!({
          sourceLanguage,
          targetLanguage: language.value,
        });

        // Translate the input value
        const translatedText = await translator.translate(input.value.trim());
        output.textContent = translatedText;
      } catch (err: any) {
        output.textContent = "An error occurred. Please try again.";
        console.error(err.name, err.message);
      }
    });
  }
})();
