import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:5000/api';

console.log('=== MITM Attack Demonstration ===\n');

async function mitmAttackWithoutSignatures() {
  console.log('1. MITM Attack WITHOUT Digital Signatures');
  console.log('-------------------------------------------');
  
  console.log('\nScenario: Attacker intercepts key exchange');
  console.log('Alice wants to communicate with Bob');
  console.log('Attacker (Mallory) intercepts the communication\n');

  console.log('Step 1: Alice initiates key exchange with Bob');
  console.log('  - Alice generates ECDH key pair');
  console.log('  - Alice sends public key to Bob (intercepted by Mallory)');
  
  console.log('\nStep 2: Mallory intercepts and replaces keys');
  console.log('  - Mallory generates her own ECDH key pair');
  console.log('  - Mallory sends her public key to Bob, pretending to be Alice');
  console.log('  - Mallory sends her public key to Alice, pretending to be Bob');
  
  console.log('\nStep 3: Both parties derive session keys with Mallory');
  console.log('  - Alice derives key with Mallory (thinks it\'s Bob)');
  console.log('  - Bob derives key with Mallory (thinks it\'s Alice)');
  console.log('  - Mallory can decrypt all messages!\n');

  console.log('Result: WITHOUT signatures, MITM attack succeeds!');
  console.log('Mallory can read and modify all messages.\n');
}

async function mitmAttackWithSignatures() {
  console.log('2. MITM Attack WITH Digital Signatures');
  console.log('--------------------------------------');
  
  console.log('\nScenario: Same attack, but with RSA signatures');
  console.log('Alice and Bob both have RSA key pairs\n');

  console.log('Step 1: Alice initiates key exchange');
  console.log('  - Alice generates ECDH key pair');
  console.log('  - Alice signs her ECDH public key with her RSA private key');
  console.log('  - Alice sends: { publicKey, signature } to Bob');
  
  console.log('\nStep 2: Mallory tries to intercept');
  console.log('  - Mallory intercepts Alice\'s message');
  console.log('  - Mallory tries to replace Alice\'s public key with her own');
  console.log('  - BUT: Mallory cannot forge Alice\'s signature!');
  console.log('  - Mallory doesn\'t have Alice\'s private key');
  
  console.log('\nStep 3: Bob verifies the signature');
  console.log('  - Bob receives message from "Alice"');
  console.log('  - Bob gets Alice\'s public RSA key from server');
  console.log('  - Bob verifies signature using Alice\'s public key');
  console.log('  - Verification FAILS if Mallory modified the message');
  console.log('  - Bob rejects the key exchange\n');

  console.log('Result: WITH signatures, MITM attack is PREVENTED!');
  console.log('Mallory cannot forge signatures, so the attack fails.\n');
}

async function demonstrateAttack() {
  try {
    console.log('Attempting to demonstrate MITM attack...\n');
    
    console.log('Note: This is a simulation. In a real attack:');
    console.log('1. Attacker would use network interception (ARP spoofing, etc.)');
    console.log('2. Attacker would modify packets in transit');
    console.log('3. Our system prevents this with digital signatures\n');

    await mitmAttackWithoutSignatures();
    await mitmAttackWithSignatures();

    console.log('=== Conclusion ===');
    console.log('Digital signatures are essential for preventing MITM attacks');
    console.log('Our implementation uses RSA-PSS signatures to verify key exchange messages');
    console.log('This ensures that only the legitimate parties can participate in key exchange\n');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

demonstrateAttack();


