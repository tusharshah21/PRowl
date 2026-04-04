/**
 * TOON (Token-Oriented Object Notation) Parser
 * Parses LLM responses in TOON format back to structured review comments
 */

export interface ReviewComment {
  lineNumber: number;
  reviewComment: string;
}

export interface TOONReviewResponse {
  reviews: ReviewComment[];
}

/**
 * Parses TOON-formatted LLM output into structured review comments
 * Handles both valid JSON and malformed responses gracefully
 */
export function parseTOONReview(output: string): ReviewComment[] {
  try {
    // Clean up the output (remove markdown code blocks if present)
    let cleaned = output.trim();
    
    // Remove markdown code fences
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "");
    }
    
    const parsed: TOONReviewResponse = JSON.parse(cleaned);
    
    // Validate the structure
    if (!parsed.reviews || !Array.isArray(parsed.reviews)) {
      console.warn("Invalid TOON response structure, no reviews array");
      return [];
    }
    
    // Validate each review item
    return parsed.reviews.filter((review) => {
      const hasValidLine = 
        review.lineNumber !== undefined && 
        typeof review.lineNumber === "number";
      const hasValidComment = 
        review.reviewComment !== undefined && 
        typeof review.reviewComment === "string" &&
        review.reviewComment.length > 0;
      
      if (!hasValidLine || !hasValidComment) {
        console.warn("Skipping invalid review item:", review);
        return false;
      }
      
      return true;
    });
  } catch (error) {
    console.error("Error parsing TOON review response:", error);
    console.error("Raw output:", output);
    return [];
  }
}

/**
 * Converts parsed TOON reviews to GitHub comment format
 */
export function convertToGitHubComments(
  reviews: ReviewComment[],
  filePath: string
): Array<{ body: string; path: string; line: number }> {
  return reviews.map((review) => ({
    body: review.reviewComment,
    path: filePath,
    line: review.lineNumber,
  }));
}
