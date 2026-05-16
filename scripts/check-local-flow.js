const crypto = require('node:crypto');
const { createLogger } = require('./lib/log');

const log = createLogger('check:local-flow');

// Smoke-check inputs. These values are NOT looked up from seed data — /init
// creates new payment records, so any non-empty values work. Change them here
// (not inline below) if the schema for /init metadata ever changes.
const TEST_DATA = {
  petitionFiling: {
    feeId: 'PETITION_FILING_FEE',
    metadata: { docketNumber: '123-26' },
  },
  nonattorneyExam: {
    feeId: 'NONATTORNEY_EXAM_REGISTRATION_FEE',
    metadata: {
      email: 'applicant@example.com',
      fullName: 'Local Flow Check',
      accessCode: 'LOCALFLOW',
    },
  },
};

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function ensureOk(response, label) {
  if (!response.ok) {
    const body = await parseResponseBody(response);
    throw new Error(
      `${label} failed: ${response.status} ${response.statusText} - ${typeof body === 'string' ? body : JSON.stringify(body)}`
    );
  }
}

function parseToken(initResponseBody) {
  if (typeof initResponseBody.token === 'string' && initResponseBody.token.length > 0) {
    return initResponseBody.token;
  }

  if (typeof initResponseBody.paymentRedirect === 'string') {
    const redirectUrl = new URL(initResponseBody.paymentRedirect);
    const redirectToken = redirectUrl.searchParams.get('token');
    if (redirectToken) {
      return redirectToken;
    }
  }

  throw new Error('Could not determine token from /init response');
}

function selectScenario(feeId) {
  const match = Object.values(TEST_DATA).find((s) => s.feeId === feeId);
  if (!match) {
    throw new Error(
      `Unknown FEE_ID: ${feeId}. Supported: ${Object.values(TEST_DATA).map((s) => s.feeId).join(', ')}`,
    );
  }
  return match;
}

async function main() {
  const apiPort = process.env.API_PORT || '8080';
  const paymentPort = process.env.PAY_GOV_TEST_SERVER_PORT || '3366';
  const baseUrl = process.env.BASE_URL || `http://localhost:${apiPort}`;
  const paymentBase = process.env.PAYMENT_URL || `http://localhost:${paymentPort}/pay`;
  const scenario = selectScenario(process.env.FEE_ID || TEST_DATA.petitionFiling.feeId);
  const initUrl = new URL('/init', baseUrl).toString();

  const initPayload = {
    transactionReferenceId: crypto.randomUUID(),
    feeId: scenario.feeId,
    urlSuccess: 'https://client.app/success',
    urlCancel: 'https://client.app/cancel',
    metadata: scenario.metadata,
  };

  log.info(`POST ${initUrl}`);
  const initResponse = await fetch(initUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(initPayload),
  });
  await ensureOk(initResponse, '/init');

  const initBody = await initResponse.json();
  const token = parseToken(initBody);
  const payUrl = new URL(paymentBase);
  payUrl.searchParams.set('token', token);

  log.info(`GET ${payUrl.toString()}`);
  const payResponse = await fetch(payUrl.toString(), {
    method: 'GET',
    headers: { accept: 'text/html' },
  });
  await ensureOk(payResponse, '/pay');

  const payHtml = await payResponse.text();
  const lowerHtml = (payHtml || '').toLowerCase();
  // Mock /pay is anchor-based and doesn't echo the token; assert on a stable marker.
  const looksLikeHtmlDoc = lowerHtml.includes('<html') && lowerHtml.includes('</html>');
  const isMockPayPage =
    lowerHtml.includes('data-payment-method') ||
    lowerHtml.includes('test payment page');

  if (!looksLikeHtmlDoc || !isMockPayPage) {
    throw new Error(
      '/pay returned 200 but did not render the expected mock payment page. ' +
        'The mock Pay.gov server is reachable but the flow is broken.'
    );
  }

  log.info('Success: /init and /pay token flow validated.');
}

main().catch((error) => {
  log.error('Failed:', error);
  process.exit(1);
});
