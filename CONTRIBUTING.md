# Contributing to SCF

Thank you for your interest in contributing to SCF! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment
4. Create a new branch for your changes
5. Make your changes
6. Submit a pull request

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- Yarn package manager
- Git

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/scf.git
cd scf

# Install dependencies
yarn install

# Build the project
yarn build

# Run tests to verify setup
yarn test
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `yarn build` | Build the project |
| `yarn dev` | Watch mode for development |
| `yarn test` | Run all tests |
| `yarn test:unit` | Run unit tests only |
| `yarn test:integration` | Run integration tests only |
| `yarn test:e2e` | Run E2E tests (requires AWS credentials) |
| `yarn test:cli` | Run CLI tests only |
| `yarn test:coverage` | Run tests with coverage report |
| `yarn lint` | Run ESLint |
| `yarn lint:fix` | Fix linting issues automatically |
| `yarn typecheck` | Run TypeScript type checking |

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/add-new-command` - For new features
- `fix/resolve-upload-issue` - For bug fixes
- `docs/update-readme` - For documentation changes
- `refactor/improve-s3-deployer` - For code refactoring

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(cli): add --verbose flag to deploy command
fix(s3): resolve multipart upload timeout issue
docs(readme): update installation instructions
```

## Pull Request Process

1. **Update your fork** with the latest changes from main
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Ensure all tests pass**
   ```bash
   yarn test
   yarn lint
   yarn build
   ```

3. **Create your pull request**
   - Use a clear, descriptive title
   - Reference any related issues
   - Describe your changes in detail
   - Include screenshots for UI changes

4. **Address review feedback**
   - Respond to all comments
   - Make requested changes
   - Push updates to your branch

5. **Wait for approval**
   - At least one maintainer approval is required
   - All CI checks must pass

### PR Checklist

- [ ] Tests pass locally (`yarn test`)
- [ ] Linting passes (`yarn lint`)
- [ ] Build succeeds (`yarn build`)
- [ ] New features include tests
- [ ] Documentation is updated if needed
- [ ] Commit messages follow conventions

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Avoid `any` type - use proper types or generics
- Export types alongside functions

### Code Style

- Use ESLint and Prettier configurations provided
- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

### File Organization

```
src/
  cli/          # CLI entry point and commands
    commands/   # Individual CLI commands (deploy, remove, status, etc.)
    utils/      # CLI-specific utilities
  core/         # Core business logic
    aws/        # AWS SDK wrappers (S3, CloudFront, ACM, Route53)
    config/     # Configuration parsing and validation
    deployer/   # Deployment orchestration
    state/      # State management
    utils/      # Core utilities
  types/        # TypeScript type definitions
  __tests__/    # Test files
    unit/       # Unit tests
    integration/# Integration tests
    e2e/        # End-to-end tests
    fixtures/   # Test fixtures and configs
```

### Naming Conventions

- **Files**: kebab-case (`s3-deployer.ts`)
- **Classes**: PascalCase (`S3Deployer`)
- **Functions/Variables**: camelCase (`uploadFile`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)
- **Types/Interfaces**: PascalCase (`DeployConfig`)

## Testing

### Test Structure

```
src/__tests__/
  unit/         # Unit tests (mocked dependencies)
  integration/  # Integration tests (real interactions between components)
  e2e/          # End-to-end tests (requires AWS credentials)
  fixtures/     # Test fixtures and sample configs
  helpers/      # Test helper utilities
  setup.ts      # Test setup file
```

### Writing Tests

```typescript
describe('S3Deployer', () => {
  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      // Arrange
      const deployer = new S3Deployer(config);

      // Act
      const result = await deployer.uploadFile(file);

      // Assert
      expect(result.success).toBe(true);
    });
  });
});
```

### Running Tests

```bash
# All tests
yarn test

# Unit tests only
yarn test:unit

# Integration tests only
yarn test:integration

# E2E tests (requires AWS credentials)
yarn test:e2e

# Specific test file
yarn test src/__tests__/unit/config-loader.test.ts

# With coverage
yarn test:coverage
```

> **Note**: E2E tests require valid AWS credentials. Set up `.env.test` based on `.env.test.example` before running E2E tests.

### Test Coverage Requirements

- Minimum 70% coverage for:
  - Branches
  - Functions
  - Lines
  - Statements

## Reporting Issues

### Bug Reports

Include:
- Clear description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, Node version, etc.)
- Error messages and stack traces

### Feature Requests

Include:
- Clear description of the feature
- Use case / motivation
- Proposed solution (if any)
- Alternatives considered

### Issue Labels

- `bug` - Something isn't working
- `enhancement` - New feature request
- `documentation` - Documentation improvements
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed

## Questions?

Feel free to open an issue or start a discussion if you have any questions!

---

Thank you for contributing to SCF!
