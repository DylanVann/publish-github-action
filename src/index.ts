import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import * as semver from 'semver'
import * as tar from 'tar'

const Github = require('@actions/github')
const Octokit = require('@octokit/rest')

const githubToken = core.getInput('github_token', { required: true })
const context = Github.context
const octokit = new Octokit({ auth: githubToken })

async function run() {
  try {
    const rawPackageJson = await fs.readFile('package.json', {
      encoding: 'utf8',
    })
    const packageJson: {
      name: string
      version: string
      files?: string[]
    } = JSON.parse(rawPackageJson)
    const name = packageJson.name
    const version = 'v' + packageJson.version
    const minorVersion =
      'v' +
      semver.major(packageJson.version) +
      '.' +
      semver.minor(packageJson.version)
    const majorVersion = 'v' + semver.major(packageJson.version)
    const branchName: string = 'releases/' + version

    const tags = await octokit.repos.listTags({
      owner: context.repo.owner,
      repo: context.repo.repo,
    })

    if (tags.data.some((tag: { name: string }) => tag.name === version)) {
      console.log('Tag', version, 'already exists')
      return
    }

    await exec.exec(`git checkout -b ${branchName}`)
    await exec.exec(
      'git config --global user.email "github-actions[bot]@users.noreply.github.com"',
    )
    await exec.exec('git config --global user.name "github-actions[bot]"')
    await exec.exec(
      'git remote set-url origin https://x-access-token:' +
        githubToken +
        '@github.com/' +
        context.repo.owner +
        '/' +
        context.repo.repo +
        '.git',
    )

    await exec.exec(`yarn install`)
    await exec.exec(`yarn run build`)
    // We manually remove some files that npm always includes (a poor choice on their part IMO).
    // Files that are not essential to running the package should not be included in the build.
    const manuallyRemovedFiles = [
      'CHANGELOG.md',
      'README.md',
      'LICENSE',
      'LICENCE',
    ]
    await Promise.all(
      manuallyRemovedFiles.map(async fileName => {
        // If the user included the file in their "files" list then they must really want it included.
        if (packageJson.files && packageJson.files.includes(fileName)) {
          return
        }
        await fs.remove(fileName)
      }),
    )
    await exec.exec(`yarn pack`)

    // We create a branch containing only the contents of the package.
    const packagedFilename = `${name}-${version}.tgz`
    const packagedFilePath = path.join(process.cwd(), packagedFilename)
    const tempPackedFilePath = path.join(os.tmpdir(), packagedFilename)
    await fs.move(packagedFilePath, tempPackedFilePath)
    // Remove all files and folders.
    await exec.exec(`git rm -rf .`)
    await exec.exec(`git clean -fdx`)
    // Move back the package.
    await fs.move(tempPackedFilePath, packagedFilePath)
    // Extract it.
    core.info(`Extracting ${packagedFilename}`)
    await exec.exec('ls')
    await tar.extract({ file: packagedFilePath })
    await fs.remove(packagedFilePath)
    // Move from "package" into cwd.
    const filesAndDirectoriesInPackage: string[] = await fs.readdir('package')
    await Promise.all(
      filesAndDirectoriesInPackage.map(p =>
        fs.move(path.join('package', p), p),
      ),
    )
    await fs.remove('package')

    await exec.exec(`git add .`)
    await exec.exec(`git commit -a -m "release ${version}"`)
    await exec.exec(`git push origin ${branchName}`)

    await exec.exec('git', ['push', 'origin', ':refs/tags/' + version])
    await exec.exec('git', ['tag', '-fa', version, '-m', version])
    await exec.exec('git', ['push', 'origin', ':refs/tags/' + minorVersion])
    await exec.exec('git', ['tag', '-f', minorVersion])
    await exec.exec('git', ['push', 'origin', ':refs/tags/' + majorVersion])
    await exec.exec('git', ['tag', '-f', majorVersion])
    await exec.exec('git push --tags origin')

    await octokit.repos.createRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
      tag_name: version,
      name: version,
    })
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
