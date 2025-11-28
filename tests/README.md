# Attack Demonstration Scripts

This directory contains scripts to demonstrate security attacks and how our system prevents them.

## MITM Attack Demonstration

**File:** `mitm-attack.js`

**Purpose:** Demonstrates how Man-in-the-Middle attacks work and how digital signatures prevent them.

**Usage:**
```bash
cd tests
node mitm-attack.js
```

**What it shows:**
1. How MITM attack works WITHOUT signatures (vulnerable)
2. How MITM attack is prevented WITH signatures (secure)
3. Explanation of the protection mechanism

## Replay Attack Demonstration

**File:** `replay-attack.js`

**Purpose:** Demonstrates replay attacks and how our protection mechanisms prevent them.

**Usage:**
```bash
cd tests
node replay-attack.js
```

**What it shows:**
1. How replay attacks work
2. How nonces prevent replay attacks
3. How sequence numbers prevent replay attacks
4. How timestamps prevent replay attacks

## Running the Scripts

Make sure you have the required dependencies:
```bash
npm install axios
```

Set the API URL if needed:
```bash
export API_URL=http://localhost:5000/api
```

## Notes

- These are demonstration/educational scripts
- They show the attack scenarios and protection mechanisms
- For actual testing, use BurpSuite or Wireshark as mentioned in requirements
- Screenshots and logs should be captured for the project report


