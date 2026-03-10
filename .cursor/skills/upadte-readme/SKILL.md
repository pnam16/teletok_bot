---
name: readme
description: Update README to Match Codebase
disable-model-invocation: true
---

# Update README to Match Codebase

When invoked with `/readme` or `cursor update @README.md match codebase`, perform a comprehensive analysis of the project and update README.md to accurately reflect the current codebase state. Use this skill in any project (apps, libraries, docs, knowledge vaults, etc.).

## Analysis Steps

1. Discover and Read Project Files:
   - Find and read the project manifest (e.g. `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, or similar)
   - List top-level directories and key files to infer project layout
   - Read scripts, tools, and automation (e.g. `scripts/`, `tools/`, `Makefile`, npm scripts, or equivalent)
   - Read config files that affect setup or usage (e.g. `.vscode/settings.json`, linters, env examples)
   - Sample or summarize important source/docs so the README reflects real behavior

2. Extract Information:
   - Project Metadata: Name, version, description, license from the manifest
   - Scripts/Commands: All defined scripts or commands (npm, make, cargo, pip, etc.) and their purposes
   - Dependencies: Runtime and dev dependencies from the manifest
   - Tools and Scripts: What custom tools or scripts exist and what they do
   - Project Structure: Actual directories and important files (discovered from the repo)
   - Features: Inferred from code, config, and tooling
   - Technologies: Frameworks, languages, and key tools in use

3. Compare with README:
   - Identify missing or outdated information
   - Find incorrect script/command names or descriptions
   - Detect outdated project structure or paths
   - Note missing features or capabilities
   - Check for incorrect installation or setup steps
   - Verify tool/script descriptions match implementations

4. Update README:
   - Align project description with the manifest and codebase
   - Ensure project structure section matches actual layout
   - Update scripts/commands with correct names and descriptions
   - Document tools and scripts that exist in the repo
   - Align features list with actual capabilities
   - Fix installation and setup steps
   - Update technologies and development workflow
   - Correct directory and file path references

## Update Requirements

### Must Update

- Project structure (directories and key files as they exist)
- All scripts/commands and their descriptions (from manifest or Makefile, etc.)
- Tool and script descriptions (for whatever exists in the repo)
- Features list (from code analysis)
- Installation and setup instructions
- Development workflow
- Technologies used
- Directory and file path references

### Must Preserve

- README structure and format
- All major sections
- Code block formatting
- Markdown syntax
- Overall tone and style

## Output

Update README.md in place, ensuring:

- All information is accurate and current
- Project structure matches the actual repo layout
- Scripts/commands match the manifest or build system
- Features reflect actual codebase capabilities
- Installation and usage instructions are correct
- Tool/script descriptions match implementations
- Formatting and structure stay consistent
- Path references are correct

## Special Considerations

- Keep README concise (quick reference, not full documentation)
- Focus on getting started and usage
- Link to other docs (e.g. DOCUMENTATION.md) when they exist
- Ensure code examples work with current scripts and setup
- Verify all file paths and commands
- Adapt wording to project type (app, library, docs site, knowledge vault, etc.) without hardcoding one kind of project
