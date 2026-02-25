"""vCenter REST API session client."""

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class VCenterClient:
    """Handles authentication and HTTP requests to the vCenter REST API."""

    def __init__(self, host: str, username: str, password: str, verify_ssl: bool = False):
        self.base_url = f"https://{host}"
        self.username = username
        self.password = password
        self.verify_ssl = verify_ssl
        self.session = requests.Session()
        self.session.verify = verify_ssl
        self._session_id = None

    def login(self) -> None:
        """Authenticate and obtain a session token."""
        url = f"{self.base_url}/api/session"
        resp = self.session.post(url, auth=(self.username, self.password))
        resp.raise_for_status()
        self._session_id = resp.json()
        self.session.headers.update({"vmware-api-session-id": self._session_id})

    def logout(self) -> None:
        """Destroy the current session."""
        if self._session_id:
            url = f"{self.base_url}/api/session"
            self.session.delete(url)
            self._session_id = None

    def get(self, path: str) -> requests.Response:
        resp = self.session.get(f"{self.base_url}{path}")
        resp.raise_for_status()
        return resp

    def put(self, path: str, json_body: dict | None = None) -> requests.Response:
        resp = self.session.put(f"{self.base_url}{path}", json=json_body)
        resp.raise_for_status()
        return resp

    def patch(self, path: str, json_body: dict | None = None) -> requests.Response:
        resp = self.session.patch(f"{self.base_url}{path}", json=json_body)
        resp.raise_for_status()
        return resp

    def __enter__(self):
        self.login()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.logout()
        return False
