import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { ApiError } from "../../../shared/http/api-error.js";
import type { EmbeddingProvider } from "../knowledge.types.js";
const responseSchema=z.object({embeddings:z.array(z.object({values:z.array(z.number()).min(1)}))});
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private readonly client:GoogleGenAI|null;
  constructor(apiKey:string|undefined,private readonly model:string){this.client=apiKey?new GoogleGenAI({apiKey}):null}
  async embed(texts:string[]){if(!this.client)throw new ApiError(503,"AI_NOT_CONFIGURED","Set GEMINI_API_KEY to index or search knowledge");try{const response=await this.client.models.embedContent({model:this.model,contents:texts});return responseSchema.parse(response).embeddings.map(x=>x.values)}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(503,"EMBEDDING_PROVIDER_UNAVAILABLE","Embedding provider is unavailable")}}
}
