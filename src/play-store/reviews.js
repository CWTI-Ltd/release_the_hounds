/**
 * Play Store reviews management module
 */

import { getPlayStoreClient } from './auth.js';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '../auth/gcloud-auth.js';
import { parse } from 'csv-parse/sync';
import zlib from 'zlib';

/**
 * List reviews for the app (Last 7 days only - Google API limitation)
 * @param {string} packageName - Android package name
 * @param {Object} options - Filtering options
 * @param {number} options.maxResults - Max results to return (default: 10)
 * @param {number} options.startIndex - Start index for pagination
 * @param {string} options.token - Pagination token
 * @returns {Promise<Object>} List of reviews
 */
export async function listReviews(packageName, options = {}) {
  const androidpublisher = await getPlayStoreClient();

  try {
    const response = await androidpublisher.reviews.list({
      packageName: packageName,
      maxResults: options.maxResults || 10,
      startIndex: options.startIndex,
      token: options.token
    });

    return response.data;
  } catch (error) {
    throw new Error(`Failed to list reviews for ${packageName}: ${error.message}`);
  }
}

/**
 * Get a single review
 * @param {string} packageName - Android package name
 * @param {string} reviewId - Review ID
 * @returns {Promise<Object>} Review details
 */
export async function getReview(packageName, reviewId) {
  const androidpublisher = await getPlayStoreClient();

  try {
    const response = await androidpublisher.reviews.get({
      packageName: packageName,
      reviewId: reviewId
    });

    return response.data;
  } catch (error) {
    throw new Error(`Failed to get review ${reviewId}: ${error.message}`);
  }
}

/**
 * Reply to a review
 * @param {string} packageName - Android package name
 * @param {string} reviewId - Review ID
 * @param {string} replyText - The reply content
 * @returns {Promise<Object>} Reply result
 */
export async function replyToReview(packageName, reviewId, replyText) {
  const androidpublisher = await getPlayStoreClient();

  try {
    const response = await androidpublisher.reviews.reply({
      packageName: packageName,
      reviewId: reviewId,
      requestBody: {
        replyText: replyText
      }
    });

    return response.data;
  } catch (error) {
    throw new Error(`Failed to reply to review ${reviewId}: ${error.message}`);
  }
}

/**
 * Get unreplied reviews (Last 7 days only)
 * @param {string} packageName - Android package name
 * @returns {Promise<Array>} List of unreplied reviews
 */
export async function getUnrepliedReviews(packageName) {
  const reviewsData = await listReviews(packageName, { maxResults: 100 });

  if (!reviewsData.reviews) {
    return [];
  }

  // A review is unreplied if it has no developerComment
  return reviewsData.reviews.filter(review => {
    const hasDeveloperComment = review.comments &&
      review.comments.some(comment => comment.developerComment);
    return !hasDeveloperComment;
  });
}

/**
 * List historical review report files from Google Cloud Storage bucket
 * This allows bypassing the 1-week limitation of the standard API.
 * @param {string} bucketId - The Bucket ID (e.g. pubsite_prod_rev_...)
 * @param {string} packageName - Android package name
 * @returns {Promise<Array>} List of historical review reports
 */
export async function listHistoryReports(bucketId, packageName) {
  const androidpublisher = await getPlayStoreClient();
  const auth = androidpublisher.context._options.auth;
  const storage = google.storage({ version: 'v1', auth });

  try {
    const response = await storage.objects.list({
      bucket: bucketId,
      prefix: `reviews/reviews_${packageName}_`
    });

    const items = response.data.items || [];
    if (items.length === 0) {
      return [];
    }

    items.sort((a, b) => new Date(b.updated) - new Date(a.updated));

    return items.map(item => ({
      reportName: item.name,
      updated: item.updated,
      size: item.size
    }));
  } catch (error) {
    throw new Error(`Failed to list historical reports: ${error.message}`);
  }
}

/**
 * Fetch and parse a historical review report
 * @param {string} bucketId - The Bucket ID
 * @param {string} reportName - Path to the report in the bucket
 * @returns {Promise<Array>} Array of parsed review objects
 */
export async function getReviewsFromReport(bucketId, reportName) {
  const androidpublisher = await getPlayStoreClient();
  const auth = androidpublisher.context._options.auth;
  const storage = google.storage({ version: 'v1', auth });

  try {
    const response = await storage.objects.get({
      bucket: bucketId,
      object: reportName,
      alt: 'media'
    }, { responseType: 'arraybuffer' });

    if (!response.data || response.data.byteLength === 0) {
      return [];
    }

    let buffer = Buffer.from(response.data);

    // Check for gzip magic number (0x1f 0x8b)
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      buffer = zlib.gunzipSync(buffer);
    }

    // Google reports are UTF-16LE
    const content = buffer.toString('utf16le');

    // Parse CSV
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    return records.map(record => {
      // Extract Review ID from the Review Link URL
      // http://play.google.com/.../review-details?reviewId=REVIEW_ID&...
      const reviewLink = record['Review Link'] || record['Link'] || '';
      const reviewIdMatch = reviewLink.match(/reviewId=([^&]+)/);
      const reviewId = reviewIdMatch ? reviewIdMatch[1] : null;

      return {
        reviewId,
        authorName: record['Reviewer Name'] || 'Anonymous',
        rating: parseInt(record['Star Rating']),
        title: record['Review Title'],
        text: record['Review Text'],
        submitDate: record['Review Submit Date and Time'] || record['Review Submit Date'],
        hasReply: !!record['Developer Reply Text'],
        replyText: record['Developer Reply Text'],
        reviewLink: reviewLink
      };
    });
  } catch (error) {
    let message = error.message;

    // Handle cases where the error response might be an ArrayBuffer
    if (error.response && error.response.data && error.response.data instanceof ArrayBuffer) {
      try {
        const errorData = JSON.parse(Buffer.from(error.response.data).toString());
        message = errorData.error?.message || message;
      } catch (e) {
        // Fallback to original message
      }
    }

    throw new Error(`Failed to fetch report ${reportName}: ${message}`);
  }
}

/**
 * Search all historical reports for unreplied reviews within a date range
 * @param {string} bucketId - The Bucket ID
 * @param {string} packageName - Android package name
 * @param {Object} options - Filtering options
 * @param {string} options.minDate - Minimum date (YYYY-MM-DD)
 * @param {string} options.maxDate - Maximum date (YYYY-MM-DD)
 * @returns {Promise<Array>} Aggregated unreplied reviews
 */
export async function searchAllHistory(bucketId, packageName, options = {}) {
  const reports = await listHistoryReports(bucketId, packageName);
  const { minDate, maxDate } = options;

  // Filter reports that might contain the date range
  // Report format: reviews_com.pkg_YYYYMM.csv
  const filteredReports = reports.filter(report => {
    const match = report.reportName.match(/_(\d{4})(\d{2})\.csv/);
    if (!match) return true; // Include if we can't tell
    const yearMonth = `${match[1]}-${match[2]}`;

    if (minDate) {
      const minYearMonth = minDate.substring(0, 7);
      if (yearMonth < minYearMonth) return false;
    }
    if (maxDate) {
      const maxYearMonth = maxDate.substring(0, 7);
      if (yearMonth > maxYearMonth) return false;
    }
    return true;
  });

  const allUnreplied = [];
  for (const report of filteredReports) {
    try {
      const reviews = await getReviewsFromReport(bucketId, report.reportName);
      const unreplied = reviews.filter(r => {
        if (r.hasReply || !r.text) return false;
        if (minDate && r.submitDate < minDate) return false;
        if (maxDate && r.submitDate > maxDate) return false;
        return true;
      });
      allUnreplied.push(...unreplied);
    } catch (error) {
      console.error(`Skipping report ${report.reportName}: ${error.message}`);
    }
  }

  return allUnreplied;
}
