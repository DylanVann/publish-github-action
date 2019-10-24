# Publish GitHub Action

![Version](https://img.shields.io/github/v/release/dylanvann/publish-github-action?style=flat-square)

A GitHub action that helps you publish your GitHub action.

Creates a release branch for your GitHub Actions which will be automatically tagged and released.
The release version can be  defined in `package.json`.

# Example Workflow

```yml
name: "Publish GitHub Action"
on:
  # Publish when commits are pushed to master.
  push:
    branches:    
      - master

jobs:
  publish:
    runs-on: ubuntu-18.04
    steps:
    - uses: actions/checkout@v1
    - uses: dylanvann/publish-github-action@v1
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
```
