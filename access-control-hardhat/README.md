# access-control-hardhat
This project implements a Solidity smart contract for an access control system as part of a final thesis. 

## Project Structure
- **contracts/**: Contains the Solidity smart contract files.
  - `AccessControl.sol`: The implementation of the access control smart contract.
  
- **scripts/**: Contains deployment scripts.
  - `deploy.ts`: Script to deploy the `AccessControl` contract.

- **test/**: Contains test files for the smart contracts.
  - `AccessControl.test.ts`: Test cases for the `AccessControl` contract.

- **hardhat.config.ts**: Configuration file for Hardhat, specifying network settings and compiler options.

- **package.json**: Lists project dependencies and scripts.

- **tsconfig.json**: TypeScript configuration file.

## Getting Started

### Prerequisites
- Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation
1. Create a new Hardhat project:
   ```bash
   mkdir access-control-hardhat
   cd access-control-hardhat
   npm init -y
   npm install --save-dev hardhat
   npx hardhat
   ```
   Follow the prompts to create a basic sample project.

2. Install additional dependencies:
   ```bash
   npm install --save-dev typescript ts-node @types/node @nomiclabs/hardhat-ethers ethers
   ```

3. Create the necessary directories and files:
   ```bash
   mkdir contracts scripts test
   touch contracts/AccessControl.sol scripts/deploy.ts test/AccessControl.test.ts hardhat.config.ts tsconfig.json README.md
   ```

### Implementation
- Implement the smart contract in `contracts/AccessControl.sol`.
- Write the deployment script in `scripts/deploy.ts`.
- Create test cases in `test/AccessControl.test.ts`.

### Configuration
- Configure Hardhat in `hardhat.config.ts`.

### Compile and Deploy
- Compile the smart contract:
  ```bash
  npx hardhat compile
  ```

- Deploy the contract:
  ```bash
  npx hardhat run scripts/deploy.ts --network <network_name>
  ```

### Testing
- Run tests:
  ```bash
  npx hardhat test
  ```

This workflow will guide you through setting up and implementing your Solidity smart contract using Hardhat.