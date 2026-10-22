/* =====================================================================
   ENHANCED SYLLABUS PARSER FOR QUESTBOOK
   ================================================================     */

const SyllabusParser = {
  // Month name mapping for text date parsing
  months: {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  },

  /**
   * Parses raw syllabus text (pasted or extracted from PDF/ICS)
   * @param {string} text - Raw text from the syllabus
   * @param {string} defaultCourse - Fallback course name if none detected
   * @returns {Array} List of parsed quest objects ready for state.quests
   */
  parseText(text, defaultCourse = "General") {
    if (!text || typeof text !== "string") return [];

    const lines = text.split(/\r?\n/);
    const quests = [];
    let detectedCourse = this.extractCourseName(text) || defaultCourse;
    const currentYear = new Date().getFullYear();

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 5) return;

      // Skip lines that look like headers or policy statements
      if (
        /^(syllabus|schedule|grading|office hours|policy|instructor|required texts)/i.test(
          trimmed,
        )
      ) {
        return;
      }

      // Extract due date using flexible regex patterns
      const dueInfo = this.extractDate(trimmed, currentYear);
      if (!dueInfo) return; // If no date is found, it's likely not a scheduled assignment/exam

      // Clean up assignment name by removing date strings and punctuation
      let assignmentName = trimmed
        .replace(dueInfo.matchedString, "")
        .replace(/^[-–—:\s]+|[-–—:\s]+$/g, "")
        .trim();

      if (assignmentName.length < 3) return;

      // Estimate reward based on keywords (exams pay more gold!)
      let reward = 50;
      if (/exam|midterm|final|project|paper|thesis/i.test(assignmentName)) {
        reward = 150;
      } else if (/quiz|reading|discussion/i.test(assignmentName)) {
        reward = 25; // standard check
      }

      quests.push({
        id: `q_imported_${Date.now()}_${index}`,
        name: assignmentName,
        course: detectedCourse,
        due: dueInfo.isoDate,
        time: "23:59", // Default end of day
        reward: reward,
        description: `Imported from syllabus on ${today()}`,
        completed: false,
        rewardPaid: false,
        importedOn: today(),
        demo: false,
      });
    });

    return quests;
  },

  /**
   * Extracts course code/name from syllabus header text
   */
  extractCourseName(text) {
    const courseRegex = /([A-Z]{2,4}\s?[0-9]{3,4}[A-Z]?)\s*[:–—-]?\s*([^\n]+)?/;
    const match = text.match(courseRegex);
    if (match) {
      return (
        match[1].trim() +
        (match[2] ? ` - ${match[2].trim().substring(0, 25)}` : "")
      );
    }
    return null;
  },

  /**
   * Flexible date extractor supporting:
   * - MM/DD or M/D (e.g. "10/24")
   * - Month Name DD (e.g. "Oct 24", "October 24th")
   * - YYYY-MM-DD
   */
  extractDate(line, currentYear) {
    // Pattern 1: YYYY-MM-DD
    const isoMatch = line.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      return { isoDate: isoMatch[0], matchedString: isoMatch[0] };
    }

    // Pattern 2: MM/DD or M/D (with optional year)
    const slashMatch = line.match(
      /\b([0-1]?[0-9])\/([0-3]?[0-9])(?:\/(20\d{2}))?\b/,
    );
    if (slashMatch) {
      const month = String(slashMatch[1]).padStart(2, "0");
      const day = String(slashMatch[2]).padStart(2, "0");
      const year = slashMatch[3] || currentYear;
      return {
        isoDate: `${year}-${month}-${day}`,
        matchedString: slashMatch[0],
      };
    }

    // Pattern 3: Month Name Day (e.g., "Oct 12", "October 5th")
    const textDateRegex =
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+([0-3]?[0-9])(?:st|nd|rd|th)?\b/i;
    const textMatch = line.match(textDateRegex);
    if (textMatch) {
      const monthNum = String(
        this.months[textMatch[1].toLowerCase().substring(0, 3)],
      ).padStart(2, "0");
      const dayNum = String(textMatch[2]).padStart(2, "0");
      return {
        isoDate: `${currentYear}-${monthNum}-${dayNum}`,
        matchedString: textMatch[0],
      };
    }

    return null;
  },
};
