#!/usr/bin/env python3
"""
ApexSovereign.ai - Pre-Launch Domain Cutover & Health Check Verification Engine
Validates DNS propagation, TLS/SSL handshake & certificate parameters, and
HTTP/telemetry gateway endpoint reachability.

Usage:
    python domain_cutover_check.py
    python domain_cutover_check.py --domain apexsovereign.ai --api-host api.apexsovereign.ai
    python domain_cutover_check.py --json
"""

import os
import sys
import time
import json
import socket
import ssl
import argparse
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import urllib.request
import urllib.error

# ANSI Terminal Styling
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


class DomainCutoverValidator:
    """
    Automated diagnostic engine verifying network, TLS, and application-layer
    readiness for ApexSovereign.ai cutover.
    """

    def __init__(
        self,
        domain: str = "apexsovereign.ai",
        api_host: str = "api.apexsovereign.ai",
        timeout: float = 8.0,
        verbose: bool = False,
    ):
        self.domain = domain.strip().lower()
        self.api_host = api_host.strip().lower()
        self.timeout = timeout
        self.verbose = verbose
        self.results: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "target_domain": self.domain,
            "target_api_host": self.api_host,
            "checks": {},
            "summary": {
                "total": 0,
                "passed": 0,
                "failed": 0,
                "warnings": 0,
                "all_passed": False,
            },
        }

    def _record(self, name: str, status: str, details: Dict[str, Any], error: Optional[str] = None):
        self.results["checks"][name] = {
            "status": status,
            "details": details,
            "error": error,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self.results["summary"]["total"] += 1
        if status == "PASS":
            self.results["summary"]["passed"] += 1
        elif status == "FAIL":
            self.results["summary"]["failed"] += 1
        elif status == "WARN":
            self.results["summary"]["warnings"] += 1

    # -----------------------------------------------------------------------
    # 1. DNS Resolution & Propagation Checks
    # -----------------------------------------------------------------------
    def check_dns_propagation(self, hostname: str, expected_record_type: str = "A") -> Tuple[bool, List[str]]:
        t0 = time.time()
        try:
            # Resolve IPv4 addresses
            addr_info = socket.getaddrinfo(hostname, 443, socket.AF_INET, socket.SOCK_STREAM)
            ip_addresses = sorted(list(set(item[4][0] for item in addr_info)))
            latency_ms = round((time.time() - t0) * 1000, 2)

            if not ip_addresses:
                self._record(
                    f"dns_{hostname}",
                    "FAIL",
                    {"hostname": hostname, "latency_ms": latency_ms},
                    error="No A records resolved for host."
                )
                return False, []

            # Check for standard known infrastructure IPs (Vercel: 76.76.21.21)
            is_vercel = any("76.76.21." in ip for ip in ip_addresses)
            self._record(
                f"dns_{hostname}",
                "PASS",
                {
                    "hostname": hostname,
                    "ip_addresses": ip_addresses,
                    "record_type": expected_record_type,
                    "latency_ms": latency_ms,
                    "vercel_edge_detected": is_vercel,
                }
            )
            return True, ip_addresses

        except socket.gaierror as gai_err:
            latency_ms = round((time.time() - t0) * 1000, 2)
            self._record(
                f"dns_{hostname}",
                "FAIL",
                {"hostname": hostname, "latency_ms": latency_ms},
                error=f"DNS lookup failed: {gai_err}"
            )
            return False, []

    # -----------------------------------------------------------------------
    # 2. TLS/SSL Handshake & Certificate Validation
    # -----------------------------------------------------------------------
    def check_tls_certificate(self, hostname: str) -> Tuple[bool, Dict[str, Any]]:
        t0 = time.time()
        context = ssl.create_default_context()
        try:
            with socket.create_connection((hostname, 443), timeout=self.timeout) as sock:
                with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                    cert = ssock.getpeercert()
                    cipher = ssock.cipher()
                    tls_version = ssock.version()
                    latency_ms = round((time.time() - t0) * 1000, 2)

            if not cert:
                self._record(
                    f"tls_{hostname}",
                    "FAIL",
                    {"hostname": hostname, "latency_ms": latency_ms},
                    error="No peer certificate retrieved during TLS handshake."
                )
                return False, {}

            # Parse subject and SANs
            subject_dict = dict(x[0] for x in cert.get("subject", []))
            issuer_dict = dict(x[0] for x in cert.get("issuer", []))
            san_entries = [val for (key, val) in cert.get("subjectAltName", []) if key == "DNS"]

            # Expiration parsing
            not_after_str = cert.get("notAfter", "")
            not_after = datetime.strptime(not_after_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            days_left = (not_after - now).days

            cert_details = {
                "hostname": hostname,
                "subject_cn": subject_dict.get("commonName", "Unknown"),
                "issuer_org": issuer_dict.get("organizationName", issuer_dict.get("commonName", "Unknown")),
                "san_entries": san_entries,
                "tls_version": tls_version,
                "cipher_suite": cipher[0] if cipher else "Unknown",
                "days_until_expiration": days_left,
                "expiration_date": not_after.isoformat(),
                "handshake_latency_ms": latency_ms,
            }

            if days_left <= 0:
                self._record(f"tls_{hostname}", "FAIL", cert_details, error=f"Certificate expired on {not_after}")
                return False, cert_details
            elif days_left < 14:
                self._record(f"tls_{hostname}", "WARN", cert_details, error=f"Certificate expires soon ({days_left} days remaining)")
                return True, cert_details

            self._record(f"tls_{hostname}", "PASS", cert_details)
            return True, cert_details

        except Exception as ssl_err:
            latency_ms = round((time.time() - t0) * 1000, 2)
            self._record(
                f"tls_{hostname}",
                "FAIL",
                {"hostname": hostname, "latency_ms": latency_ms},
                error=f"TLS handshake error: {ssl_err}"
            )
            return False, {}

    # -----------------------------------------------------------------------
    # 3. HTTP & Cryptographic Telemetry Gateway Endpoint Probes
    # -----------------------------------------------------------------------
    def probe_http_endpoint(
        self,
        url: str,
        name: str,
        expected_status: int = 200,
        expected_json_keys: Optional[List[str]] = None,
    ) -> Tuple[bool, Dict[str, Any]]:
        t0 = time.time()
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "ApexSovereign-Cutover-Validator/2.5.0",
                "Accept": "application/json, text/html, */*",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                latency_ms = round((time.time() - t0) * 1000, 2)
                status_code = resp.getcode()
                final_url = resp.geturl()
                content_type = resp.headers.get("Content-Type", "")
                server_header = resp.headers.get("Server", "Unknown")
                body_bytes = resp.read()

                # Detect Vercel Deployment Protection / Authentication Login Wall
                if "vercel.com/login" in final_url or "x-vercel-protection" in resp.headers:
                    self._record(
                        name,
                        "FAIL",
                        {"url": url, "final_url": final_url, "status_code": status_code, "latency_ms": latency_ms},
                        error="CRITICAL: Domain is blocked by Vercel Deployment Protection (login wall). Fix: Go to Vercel Project Settings -> Deployment Protection -> Disable Vercel Authentication for Production."
                    )
                    return False, {"url": url, "status_code": status_code}

                parsed_json = None
                if "application/json" in content_type:
                    try:
                        parsed_json = json.loads(body_bytes.decode("utf-8"))
                    except Exception:
                        pass

                details = {
                    "url": url,
                    "status_code": status_code,
                    "latency_ms": latency_ms,
                    "content_type": content_type,
                    "server": server_header,
                }

                if status_code != expected_status:
                    self._record(name, "FAIL", details, error=f"Expected HTTP {expected_status}, got {status_code}")
                    return False, details

                # Validate expected keys if JSON is required
                if expected_json_keys and parsed_json:
                    missing = [k for k in expected_json_keys if k not in parsed_json]
                    if missing:
                        self._record(
                            name,
                            "FAIL",
                            details,
                            error=f"Missing expected keys in telemetry payload: {missing}"
                        )
                        return False, details
                    details["payload_status"] = parsed_json.get("status")

                self._record(name, "PASS", details)
                return True, details

        except urllib.error.HTTPError as http_err:
            latency_ms = round((time.time() - t0) * 1000, 2)
            self._record(
                name,
                "FAIL",
                {"url": url, "status_code": http_err.code, "latency_ms": latency_ms},
                error=f"HTTP Error {http_err.code}: {http_err.reason}"
            )
            return False, {}
        except Exception as probe_err:
            latency_ms = round((time.time() - t0) * 1000, 2)
            self._record(
                name,
                "FAIL",
                {"url": url, "latency_ms": latency_ms},
                error=f"Connection/Probe failed: {probe_err}"
            )
            return False, {}

    # -----------------------------------------------------------------------
    # Master Execution Routine
    # -----------------------------------------------------------------------
    def run_all_checks(self) -> Dict[str, Any]:
        """Runs the sequential diagnostic matrix."""
        # 1. DNS Checks
        self.check_dns_propagation(self.domain, "A (Root / Frontend)")
        self.check_dns_propagation(self.api_host, "CNAME / A (Backend)")

        # 2. TLS/SSL Checks
        self.check_tls_certificate(self.domain)
        self.check_tls_certificate(self.api_host)

        # 3. Application & Gateway Probes
        self.probe_http_endpoint(f"https://{self.domain}", "http_frontend_root", expected_status=200)
        self.probe_http_endpoint(
            f"https://{self.api_host}/health",
            "http_api_health",
            expected_status=200,
            expected_json_keys=["status", "uptime_seconds"]
        )
        self.probe_http_endpoint(
            f"https://{self.api_host}/v3/engine/telemetry/billing/gateway",
            "http_telemetry_gateway",
            expected_status=200,
            expected_json_keys=["status", "gateway", "security"]
        )

        all_clean = (self.results["summary"]["failed"] == 0)
        self.results["summary"]["all_passed"] = all_clean
        return self.results

    def print_terminal_report(self):
        """Prints high-visibility executive CLI output."""
        print(f"\n{BOLD}{CYAN}========================================================================{RESET}")
        print(f"{BOLD}{CYAN}      APEXSOVEREIGN.AI — DOMAIN CUTOVER & INFRASTRUCTURE HEALTH PROBE    {RESET}")
        print(f"{BOLD}{CYAN}========================================================================{RESET}")
        print(f"Target Root Domain: {BOLD}{self.domain}{RESET}")
        print(f"Target API Ingress: {BOLD}{self.api_host}{RESET}")
        print(f"Execution Time:     {self.results['timestamp']}\n")

        for check_name, data in self.results["checks"].items():
            status = data["status"]
            if status == "PASS":
                badge = f"{GREEN}[PASS]{RESET}"
            elif status == "WARN":
                badge = f"{YELLOW}[WARN]{RESET}"
            else:
                badge = f"{RED}[FAIL]{RESET}"

            print(f"{badge} {BOLD}{check_name:<28}{RESET}", end="")
            details = data.get("details", {})
            if "latency_ms" in details:
                print(f" (Latency: {details['latency_ms']}ms)", end="")
            if "status_code" in details:
                print(f" [HTTP {details['status_code']}]", end="")
            if "days_until_expiration" in details:
                print(f" [Cert: {details['days_until_expiration']}d remaining]", end="")
            if "ip_addresses" in details:
                print(f" -> {', '.join(details['ip_addresses'])}", end="")

            print()

            if data.get("error"):
                print(f"      {RED}└─ Reason: {data['error']}{RESET}")

        summary = self.results["summary"]
        print(f"\n{BOLD}------------------------------------------------------------------------{RESET}")
        print(f"Summary: Total: {summary['total']} | {GREEN}Passed: {summary['passed']}{RESET} | {RED}Failed: {summary['failed']}{RESET} | {YELLOW}Warnings: {summary['warnings']}{RESET}")

        if summary["all_passed"]:
            print(f"{BOLD}{GREEN}✓ ALL SYSTEMS OPERATIONAL: apexsovereign.ai cutover verified.{RESET}\n")
        else:
            print(f"{BOLD}{YELLOW}⚠ CUTOVER PENDING: Ensure DNS records and Render/Vercel domains are active.{RESET}\n")


def main():
    parser = argparse.ArgumentParser(description="ApexSovereign.ai Domain Cutover & Health Check Verification")
    parser.add_argument("--domain", default="apexsovereign.ai", help="Root domain (default: apexsovereign.ai)")
    parser.add_argument("--api-host", default="api.apexsovereign.ai", help="API host (default: api.apexsovereign.ai)")
    parser.add_argument("--timeout", type=float, default=8.0, help="Connection timeout in seconds")
    parser.add_argument("--json", action="store_true", help="Output results in raw JSON for CI/CD")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose debug tracing")

    args = parser.parse_args()

    validator = DomainCutoverValidator(
        domain=args.domain,
        api_host=args.api_host,
        timeout=args.timeout,
        verbose=args.verbose,
    )

    results = validator.run_all_checks()

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        validator.print_terminal_report()

    # Exit code 0 if all passed, 1 if any failure
    sys.exit(0 if results["summary"]["all_passed"] else 1)


if __name__ == "__main__":
    main()
