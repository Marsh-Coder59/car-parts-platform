"""
Unit tests for backend/main.py's Mailjet email integration (_send_email).

These test the HTTP-level behavior of _send_email() in isolation, with
urllib.request.urlopen mocked — no real network calls, no real emails
sent, no live database required.

Run with:  python -m unittest backend/tests/test_mailjet_email.py -v
(from the backend/ directory, with the project's requirements installed)

Scope note: the four auth flows (registration verification, resend,
forgot-password, reset-password) all call this same _send_email()
function as their single send path (see main.py — grep for
"_send_email(" shows every call site). These unit tests cover the
Mailjet integration itself; they do not spin up the FastAPI app or a
Postgres database, so they do not re-verify registration/login business
logic (that logic is unchanged by this migration — only the email
transport changed).
"""
import json
import socket
import unittest
import urllib.error
from unittest.mock import patch, MagicMock

import main  # noqa: E402  (requires backend/requirements.txt to be installed)


DUMMY_ENV = {
    "MAILJET_API_KEY": "test_api_key_dummy",
    "MAILJET_SECRET_KEY": "test_secret_key_dummy",
    "SMTP_FROM": "noreply@test.example",
    "SMTP_FROM_NAME": "Test Sender",
}


def _mock_http_response(status: int, body: dict):
    resp = MagicMock()
    resp.getcode.return_value = status
    resp.read.return_value = json.dumps(body).encode("utf-8")
    resp.__enter__.return_value = resp
    resp.__exit__.return_value = False
    return resp


class TestMailjetEmail(unittest.TestCase):
    def setUp(self):
        self.env_patch = patch.dict("os.environ", DUMMY_ENV, clear=False)
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()

    # 1. Successful Mailjet API response -------------------------------
    @patch("main.urllib.request.urlopen")
    def test_successful_send(self, mock_urlopen):
        mock_urlopen.return_value = _mock_http_response(
            200, {"Messages": [{"Status": "success"}]}
        )
        result = main._send_email("user@example.com", "Subject", "<p>hi</p>", "hi")
        self.assertTrue(result)
        # Verify the request was built correctly: HTTPS endpoint, Basic
        # Auth header present, no secrets leaked into the URL.
        sent_request = mock_urlopen.call_args[0][0]
        self.assertEqual(sent_request.full_url, main.MAILJET_SEND_URL)
        self.assertTrue(sent_request.full_url.startswith("https://"))
        self.assertIn("Basic ", sent_request.get_header("Authorization"))

    # 2. Invalid API credentials (401) ----------------------------------
    @patch("main.urllib.request.urlopen")
    def test_invalid_credentials(self, mock_urlopen):
        err_body = json.dumps({"ErrorMessage": "Unauthorized"}).encode()
        mock_urlopen.side_effect = urllib.error.HTTPError(
            main.MAILJET_SEND_URL, 401, "Unauthorized", {}, fp=MagicMock(read=lambda: err_body)
        )
        result = main._send_email("user@example.com", "Subject", "<p>hi</p>")
        self.assertFalse(result)

    # 3. Invalid / unverified sender (400) -------------------------------
    @patch("main.urllib.request.urlopen")
    def test_invalid_sender(self, mock_urlopen):
        err_body = json.dumps({"ErrorMessage": "sender not verified"}).encode()
        mock_urlopen.side_effect = urllib.error.HTTPError(
            main.MAILJET_SEND_URL, 400, "Bad Request", {}, fp=MagicMock(read=lambda: err_body)
        )
        result = main._send_email("user@example.com", "Subject", "<p>hi</p>")
        self.assertFalse(result)

    # 4. Network timeout --------------------------------------------------
    @patch("main.urllib.request.urlopen")
    def test_timeout(self, mock_urlopen):
        mock_urlopen.side_effect = socket.timeout("timed out")
        result = main._send_email("user@example.com", "Subject", "<p>hi</p>")
        self.assertFalse(result)

    # 5. Connection failure -------------------------------------------------
    @patch("main.urllib.request.urlopen")
    def test_connection_failure(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.URLError(ConnectionRefusedError("refused"))
        result = main._send_email("user@example.com", "Subject", "<p>hi</p>")
        self.assertFalse(result)

    # 6. Rate limiting / provider error response -----------------------------
    @patch("main.urllib.request.urlopen")
    def test_rate_limited(self, mock_urlopen):
        err_body = json.dumps({"ErrorMessage": "too many requests"}).encode()
        mock_urlopen.side_effect = urllib.error.HTTPError(
            main.MAILJET_SEND_URL, 429, "Too Many Requests", {}, fp=MagicMock(read=lambda: err_body)
        )
        result = main._send_email("user@example.com", "Subject", "<p>hi</p>")
        self.assertFalse(result)

    @patch("main.urllib.request.urlopen")
    def test_provider_5xx_error(self, mock_urlopen):
        err_body = json.dumps({"ErrorMessage": "internal error"}).encode()
        mock_urlopen.side_effect = urllib.error.HTTPError(
            main.MAILJET_SEND_URL, 500, "Internal Server Error", {}, fp=MagicMock(read=lambda: err_body)
        )
        result = main._send_email("user@example.com", "Subject", "<p>hi</p>")
        self.assertFalse(result)

    # Mailjet can return HTTP 200 with a per-message failure -----------------
    @patch("main.urllib.request.urlopen")
    def test_http_200_but_message_status_error(self, mock_urlopen):
        mock_urlopen.return_value = _mock_http_response(
            200, {"Messages": [{"Status": "error", "Errors": [{"ErrorMessage": "invalid recipient"}]}]}
        )
        result = main._send_email("user@example.com", "Subject", "<p>hi</p>")
        self.assertFalse(result)

    # Dev mode: no Mailjet credentials configured -----------------------------
    @patch.dict("os.environ", {"MAILJET_API_KEY": "", "MAILJET_SECRET_KEY": ""})
    @patch("main.urllib.request.urlopen")
    def test_dev_mode_no_credentials_does_not_call_network(self, mock_urlopen):
        result = main._send_email("user@example.com", "Subject", "<p>hi</p>")
        self.assertFalse(result)
        mock_urlopen.assert_not_called()

    # Secrets must never be logged -------------------------------------------
    @patch("main.urllib.request.urlopen")
    @patch("main.logger")
    def test_secrets_not_logged_on_success(self, mock_logger, mock_urlopen):
        mock_urlopen.return_value = _mock_http_response(200, {"Messages": [{"Status": "success"}]})
        main._send_email("user@example.com", "Verify your account", "<p>link: TOKEN_SECRET_ABC123</p>", "TOKEN_SECRET_ABC123")
        all_log_text = " ".join(
            str(call) for call in (mock_logger.info.call_args_list + mock_logger.error.call_args_list)
        )
        self.assertNotIn(DUMMY_ENV["MAILJET_SECRET_KEY"], all_log_text)
        self.assertNotIn(DUMMY_ENV["MAILJET_API_KEY"], all_log_text)
        self.assertNotIn("TOKEN_SECRET_ABC123", all_log_text)

    @patch("main.urllib.request.urlopen")
    @patch("main.logger")
    def test_secrets_not_logged_on_failure(self, mock_logger, mock_urlopen):
        err_body = json.dumps({"ErrorMessage": "bad request"}).encode()
        mock_urlopen.side_effect = urllib.error.HTTPError(
            main.MAILJET_SEND_URL, 400, "Bad Request", {}, fp=MagicMock(read=lambda: err_body)
        )
        main._send_email("user@example.com", "Reset your password", "<p>link: RESET_TOKEN_XYZ789</p>", "RESET_TOKEN_XYZ789")
        all_log_text = " ".join(
            str(call) for call in (mock_logger.info.call_args_list + mock_logger.error.call_args_list)
        )
        self.assertNotIn(DUMMY_ENV["MAILJET_SECRET_KEY"], all_log_text)
        self.assertNotIn(DUMMY_ENV["MAILJET_API_KEY"], all_log_text)
        self.assertNotIn("RESET_TOKEN_XYZ789", all_log_text)

    # Dev-mode log line must not include the body either (verification
    # links / reset tokens live in body_html / body_text).
    @patch.dict("os.environ", {"MAILJET_API_KEY": "", "MAILJET_SECRET_KEY": ""})
    @patch("main.logger")
    def test_secrets_not_logged_in_dev_mode(self, mock_logger):
        main._send_email("user@example.com", "Verify", "<p>token=SUPER_SECRET_TOKEN</p>", "token=SUPER_SECRET_TOKEN")
        all_log_text = " ".join(str(call) for call in mock_logger.info.call_args_list)
        self.assertNotIn("SUPER_SECRET_TOKEN", all_log_text)


if __name__ == "__main__":
    unittest.main()
