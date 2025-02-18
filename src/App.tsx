import React, { useState, useEffect, useRef } from "react";
import {
  FiSend,
  FiRefreshCw,
  FiMenu,
  FiUser,
  FiSettings,
  FiInfo,
  FiHelpCircle,
  FiGlobe,
} from "react-icons/fi";
import {
  LanguageDetector,
  LanguageDetectorPrediction,
} from "@mediapipe/tasks-text";

interface AITranslatorCapabilities {
  languagePairAvailable: (
    source: string,
    target: string
  ) => Promise<"after-download" | "ready" | "unsupported">;
}

interface AITranslator {
  capabilities: () => Promise<AITranslatorCapabilities>;
  create: (options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: any) => void;
  }) => Promise<{
    translate: (text: string) => Promise<string>;
  }>;
}

interface AISummarizerCapabilities {
  available: "no" | "readily" | "after-download";
}

interface AISummarizer {
  capabilities: () => Promise<AISummarizerCapabilities>;
  create: (options: {
    sharedContext?: string;
    type?: string;
    format?: string;
    length?: string;
    monitor?: (m: any) => void;
  }) => Promise<{
    summarize: (
      text: string,
      options?: { context?: string }
    ) => Promise<string>;
  }>;
}

interface AINamespace {
  translator: AITranslator;
  summarizer: AISummarizer;
}

declare global {
  interface Window {
    ai: AINamespace;
  }
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  translation?: string;
  summary?: string;
  detectedLanguage?: string;
  languages?: LanguageDetectorPrediction[];
}

const App = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [detector, setDetector] = useState<LanguageDetector | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    loaded: number;
    total: number;
  } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const supportedLanguages = [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "pt", name: "Portuguese" },
    { code: "ru", name: "Russian" },
    { code: "tr", name: "Turkish" },
  ];

  useEffect(() => {
    const initializeDetector = async () => {
      try {
        const { LanguageDetector, FilesetResolver } = await import(
          "@mediapipe/tasks-text"
        );

        const text = await FilesetResolver.forTextTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-text@0.10.0/wasm"
        );

        const languageDetector = await LanguageDetector.createFromOptions(
          text,
          {
            baseOptions: {
              modelAssetPath: `https://storage.googleapis.com/mediapipe-models/language_detector/language_detector/float32/1/language_detector.tflite`,
            },
            maxResults: 5,
          }
        );

        setDetector(languageDetector);
      } catch (error) {
        console.error("Error initializing language detector:", error);
      }
    };

    initializeDetector();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (inputText.trim() === "") return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText("");
    detectLanguage(inputText);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const detectLanguage = async (text: string) => {
    setIsLoading(true);

    try {
      if (!detector) {
        throw new Error("Language detector is not initialized");
      }

      const detectionResult = await detector.detect(text);

      const botMessage: Message = {
        id: Date.now().toString(),
        text: text,
        isUser: false,
        timestamp: new Date(),
        detectedLanguage:
          detectionResult.languages?.[0]?.languageCode || "unknown",
        languages: detectionResult.languages,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Error detecting language:", error);

      const errorMessage: Message = {
        id: Date.now().toString(),
        text: "Sorry, I could not detect the language. Please try again.",
        isUser: false,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const translateMessage = async (messageId: string) => {
    const messageToTranslate = messages.find((msg) => msg.id === messageId);
    if (!messageToTranslate || !messageToTranslate.detectedLanguage) return;

    setIsTranslating(true);
    setDownloadProgress(null);

    try {
      const sourceLanguage = messageToTranslate.detectedLanguage;

      const translatorCapabilities = await window.ai.translator.capabilities();
      const status = await translatorCapabilities.languagePairAvailable(
        sourceLanguage,
        selectedLanguage
      );

      let translatedText = "";

      if (status === "after-download") {
        const translator = await window.ai.translator.create({
          sourceLanguage,
          targetLanguage: selectedLanguage,
          monitor(m: any) {
            m.addEventListener("downloadprogress", (e: any) => {
              setDownloadProgress({
                loaded: e.loaded,
                total: e.total,
              });
            });
          },
        });

        translatedText = await translator.translate(messageToTranslate.text);
      } else if (status === "unsupported") {
        translatedText = `Translation from ${sourceLanguage} to ${selectedLanguage} is not supported.`;
      } else {
        const translator = await window.ai.translator.create({
          sourceLanguage,
          targetLanguage: selectedLanguage,
        });

        translatedText = await translator.translate(messageToTranslate.text);
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, translation: translatedText } : msg
        )
      );
    } catch (error) {
      console.error("Error translating text:", error);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, translation: "Error: Could not translate text" }
            : msg
        )
      );
    } finally {
      setIsTranslating(false);
      setDownloadProgress(null);
    }
  };

  const summarizeMessage = async (messageId: string) => {
    const messageToSummarize = messages.find((msg) => msg.id === messageId);
    if (!messageToSummarize) return;

    setIsSummarizing(true);
    setDownloadProgress(null);

    try {
      const options = {
        sharedContext: "This is a chat message",
        type: "key-points",
        format: "markdown",
        length: "medium",
      };

      const summarizerCapabilities = await window.ai.summarizer.capabilities();
      const status = await summarizerCapabilities.available;

      let summarizer;
      let summary = "";

      if (status === "no") {
        summary = "The Summarizer API isn't available for this content.";
      } else if (status === "readily") {
        summarizer = await window.ai.summarizer.create(options);
        summary = await summarizer.summarize(messageToSummarize.text, {
          context: "This is a chat message for summarization.",
        });
      } else {
        summarizer = await window.ai.summarizer.create({
          ...options,
          monitor(m: any) {
            m.addEventListener("downloadprogress", (e: any) => {
              setDownloadProgress({
                loaded: e.loaded,
                total: e.total,
              });
            });
          },
        });

        summary = await summarizer.summarize(messageToSummarize.text, {
          context: "This is a chat message for summarization.",
        });
      }

      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, summary } : msg))
      );
    } catch (error) {
      console.error("Error summarizing text:", error);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, summary: "Error: Could not summarize text" }
            : msg
        )
      );
    } finally {
      setIsSummarizing(false);
      setDownloadProgress(null);
    }
  };

  const languageTagToHumanReadable = (
    languageTag: string,
    targetLanguage = "en"
  ) => {
    try {
      const displayNames = new Intl.DisplayNames([targetLanguage], {
        type: "language",
      });
      return displayNames.of(languageTag);
    } catch (error) {
      console.error("Error converting language tag:", error);
      return languageTag;
    }
  };

  return (
    <div
      className="flex flex-col h-screen bg-gray-100"
      style={{
        backgroundImage: "url('/wall.jpg')",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundColor: "rgba(255, 255, 255, 0.85)",
        backgroundBlendMode: "overlay",
      }}
    >
      <header className="sticky top-0 z-10 bg-white shadow-md">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="text-blue-600 text-xl font-bold">Budi</span>
              <span className="text-cyan-600 text-xs">By TonyDim</span>
            </div>

            <nav className="hidden md:flex space-x-6">
              <a
                href="#"
                className="flex items-center text-gray-700 hover:text-blue-600"
              >
                <FiGlobe className="mr-1" /> Language
              </a>
              <a
                href="#"
                className="flex items-center text-gray-700 hover:text-blue-600"
              >
                <FiInfo className="mr-1" /> Summarize
              </a>
              <a
                href="#"
                className="flex items-center text-gray-700 hover:text-blue-600"
              >
                <FiHelpCircle className="mr-1" /> Help
              </a>
              <a
                href="#"
                className="flex items-center text-gray-700 hover:text-blue-600"
              >
                <FiSettings className="mr-1" /> Settings
              </a>
              <a
                href="#"
                className="flex items-center text-gray-700 hover:text-blue-600"
              >
                <FiUser className="mr-1" /> Account
              </a>
            </nav>

            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-gray-700 hover:text-blue-600 focus:outline-none"
                aria-label="Toggle mobile menu"
              >
                <FiMenu size={24} />
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden py-3 border-t border-gray-200">
              <div className="flex flex-col space-y-3">
                <a
                  href="#"
                  className="flex items-center py-2 text-gray-700 hover:text-blue-600"
                >
                  <FiGlobe className="mr-2" /> Language
                </a>
                <a
                  href="#"
                  className="flex items-center py-2 text-gray-700 hover:text-blue-600"
                >
                  <FiInfo className="mr-2" /> Summarize
                </a>
                <a
                  href="#"
                  className="flex items-center py-2 text-gray-700 hover:text-blue-600"
                >
                  <FiHelpCircle className="mr-2" /> Help
                </a>
                <a
                  href="#"
                  className="flex items-center py-2 text-gray-700 hover:text-blue-600"
                >
                  <FiSettings className="mr-2" /> Settings
                </a>
                <a
                  href="#"
                  className="flex items-center py-2 text-gray-700 hover:text-blue-600"
                >
                  <FiUser className="mr-2" /> Account
                </a>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex-grow overflow-auto p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className="mb-4">
              <div
                className={`p-3 rounded-lg ${
                  message.isUser
                    ? "bg-blue-100 ml-auto max-w-3/4"
                    : "bg-white max-w-3/4"
                }`}
              >
                <p>{message.text}</p>

                {!message.isUser &&
                  message.languages &&
                  message.languages.length > 0 && (
                    <div className="mt-2 text-sm text-gray-600">
                      Budi is{" "}
                      {(message.languages[0].probability * 100).toFixed(1)}%
                      sure that the language is{" "}
                      <span className="text-blue-600 font-bold">
                        {languageTagToHumanReadable(
                          message.languages[0].languageCode
                        )}
                      </span>
                    </div>
                  )}
              </div>

              {!message.isUser && (
                <div className="mt-2">
                  <div className="flex items-center mt-2 space-x-2">
                    {message.text.length > 150 &&
                      message.detectedLanguage === "en" && (
                        <button
                          onClick={() => summarizeMessage(message.id)}
                          disabled={isSummarizing}
                          className="bg-purple-500 text-white px-3 py-1 rounded hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 disabled:bg-purple-300 disabled:cursor-not-allowed"
                          aria-label="Summarize message"
                        >
                          {isSummarizing ? "Summarizing..." : "Summarize"}
                        </button>
                      )}

                    <div className="flex items-center">
                      <select
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value)}
                        className="mr-2 p-1 border border-gray-300 rounded"
                        aria-label="Select target language"
                      >
                        {supportedLanguages.map((lang) => (
                          <option key={lang.code} value={lang.code}>
                            {lang.name}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => translateMessage(message.id)}
                        disabled={isTranslating}
                        className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 disabled:bg-green-300 disabled:cursor-not-allowed"
                        aria-label="Translate message"
                      >
                        {isTranslating ? "Translating..." : "Translate"}
                      </button>
                    </div>
                  </div>

                  {downloadProgress && (
                    <div className="mt-2">
                      <div className="text-sm text-gray-600 mb-1">
                        Downloading language model:{" "}
                        {(
                          (downloadProgress.loaded / downloadProgress.total) *
                          100
                        ).toFixed(1)}
                        %
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${
                              (downloadProgress.loaded /
                                downloadProgress.total) *
                              100
                            }%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {message.translation && (
                    <div className="mt-2 p-2 bg-gray-100 rounded">
                      {message.translation}
                    </div>
                  )}

                  {message.summary && (
                    <div className="mt-2 p-2 bg-gray-100 rounded">
                      {message.summary}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center p-3 bg-gray-100 rounded-lg">
              <FiRefreshCw className="animate-spin mr-2" />
              Processing...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex items-center">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your message here..."
            className="flex-grow resize-none p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
            aria-label="Message input"
          />

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className="ml-3 bg-blue-500 text-white p-3 rounded-full hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:bg-blue-300 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <FiSend size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
