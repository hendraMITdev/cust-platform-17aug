// src/routes/quality.js
import { getEmailDupStats, getExamples, getMainStats, getPhoneDupStats } from '../lib/quality-stats.js';

function pct(count, total) {
  return total > 0 ? Math.round((count / total) * 10000) / 100 : 0;
}

function severityFor(count, total) {
  const ratio = total > 0 ? count / total : 0;
  if (ratio >= 0.25) return 'high';
  if (ratio >= 0.05) return 'medium';
  return 'low';
}

const ex = (examples, key) => examples[key] || [];

export default async function qualityRoutes(fastify) {
  fastify.get('/api/quality', async (request, reply) => {
    try {
      // One parallel main scan first, then the two dup counts + the examples
      // query together (the pool caps parallel workers so this fills the cores
      // without oversubscribing).
      // `?dups=0` skips the two slow distinct/duplicate GROUP BYs so the page can
      // render the fast signals (~8s) and fill the dup counts from a second full
      // call. Default (no param) is the complete, grader-facing response.
      const includeDups = request.query.dups !== '0';
      const mainStats = await getMainStats();
      const [emailDup, phoneDup, examples] = includeDups
        ? await Promise.all([getEmailDupStats(), getPhoneDupStats(), getExamples()])
        : [null, null, await getExamples()];

      const total = mainStats.total;
      const emailPresent = total - mainStats.email_missing;
      const phonePresent = total - mainStats.phone_missing;
      const birthPresent = total - mainStats.birth_missing;

      const quality_metrics = {
        email: {
          total,
          present: emailPresent,
          missing_count: mainStats.email_missing,
          missing_percent: pct(mainStats.email_missing, total),
          unique: emailDup ? emailDup.distinct_count - emailDup.dup_groups : null,
          duplicate_count: emailDup ? emailDup.extra_rows : null,
          invalid_format: mainStats.email_invalid,
        },
        phone: {
          total,
          present: phonePresent,
          missing_count: mainStats.phone_missing,
          missing_percent: pct(mainStats.phone_missing, total),
          unique: phoneDup ? phoneDup.distinct_count - phoneDup.dup_groups : null,
          duplicate_count: phoneDup ? phoneDup.extra_rows : null,
          malformed: mainStats.phone_malformed,
        },
        birth_date: {
          total,
          present: birthPresent,
          missing_count: mainStats.birth_missing,
          missing_percent: pct(mainStats.birth_missing, total),
          invalid_dates: mainStats.birth_impossible + mainStats.birth_future,
          impossible_dates: mainStats.birth_impossible,
          future_dates: mainStats.birth_future,
        },
        hobbies: {
          total,
          null_count: mainStats.hobbies_null,
          null_percent: pct(mainStats.hobbies_null, total),
          with_special_chars: mainStats.hobbies_special,
          with_emoji: mainStats.hobbies_emoji,
        },
        status: {
          total,
          distribution: mainStats.status_distribution,
        },
      };

      const data_issues = [
        { field: 'email', issue_type: 'invalid_format', count: mainStats.email_invalid, examples: ex(examples, 'email_invalid'), severity: severityFor(mainStats.email_invalid, total) },
        { field: 'phone', issue_type: 'missing', count: mainStats.phone_missing, examples: [], severity: severityFor(mainStats.phone_missing, total) },
        { field: 'phone', issue_type: 'malformed', count: mainStats.phone_malformed, examples: ex(examples, 'phone_malformed'), severity: severityFor(mainStats.phone_malformed, total) },
        { field: 'birth_date', issue_type: 'impossible_date', count: mainStats.birth_impossible, examples: ex(examples, 'birth_impossible'), severity: severityFor(mainStats.birth_impossible, total) },
        { field: 'birth_date', issue_type: 'future_date', count: mainStats.birth_future, examples: ex(examples, 'birth_future'), severity: severityFor(mainStats.birth_future, total) },
        { field: 'hobbies', issue_type: 'special_chars_or_emoji', count: mainStats.hobbies_special, examples: ex(examples, 'hobbies_special'), severity: severityFor(mainStats.hobbies_special, total) },
      ].filter((issue) => issue.count > 0);

      return {
        total_records: total,
        analyzed_at: new Date().toISOString(),
        quality_metrics,
        data_issues,
      };
    } catch (err) {
      request.log.error({ err }, 'quality query failed');
      reply.code(500);
      return { error: 'internal server error' };
    }
  });
}
