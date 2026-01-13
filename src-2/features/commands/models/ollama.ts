import { Settings, UpdateSettings } from "../../../config/settings";
import type { Model } from "../../../types/Model";
import useSettingsStore from "../../../store/useSettingsStore";
import OllamaClient from "../../../services/ollama";

// =============================================================================
// Ollama Utilities
// =============================================================================

//https://docs.ollama.com/api/pull
