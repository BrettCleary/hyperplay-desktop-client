import * as fs from 'fs'
import * as crypto from 'crypto'
import * as os from 'os'
import * as child_process from 'child_process'
import axios from 'axios'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'

async function main() {
  console.log('tag name: ', process.env.RELEASE_VERSION)
  const useTestRepo = true
  const repoOrgName = useTestRepo ? 'BrettCleary' : 'HyperPlay-Gaming'
  const repoName = repoOrgName + '/hyperplay-desktop-client'

  // update url in xyz.hyperplay.HyperPlay.yml
  console.log('updating url in xyz.hyperplay.HyperPlay.yml')
  const ymlFilePath = './xyz.hyperplay.HyperPlay/xyz.hyperplay.HyperPlay.yml'
  let hpYml = fs.readFileSync(ymlFilePath).toString()

  const releaseString = `https://github.com/${repoName}/releases/download/${
    process.env.RELEASE_VERSION
  }/hyperplay-${process.env.RELEASE_VERSION?.substring(1)}.tar.xz`
  hpYml = hpYml.replace(
    /https:\/\/github.com\/HyperPlay-Gaming\/hyperplay-desktop-client\/releases\/download\/v.*..*..*\/hyperplay-.*..*..*.tar.xz/,
    releaseString
  )

  // update hash in xyz.hyperplay.HyperPlay.yml from latest .tar.xz release
  console.log('updating hash in xyz.hyperplay.HyperPlay.yml')
  const { data } = await axios.get(
    `https://api.github.com/repos/${repoName}/releases/latest`
  )
  const tarxz = data.assets.find((asset) =>
    asset.browser_download_url.includes('tar.xz')
  )
  const outputFile = `${os.tmpdir()}/hyperplay.tar.xz`
  child_process.spawnSync('curl', [
    '-L',
    tarxz.browser_download_url,
    '-o',
    outputFile,
    '--create-dirs'
  ])
  const outputContent = fs.readFileSync(outputFile)
  const hashSum = crypto.createHash('sha512')
  hashSum.update(outputContent)
  const sha512 = hashSum.digest('hex')
  fs.rmSync(outputFile)

  hpYml = hpYml.replace(/sha512: [0-9, a-f]{128}/, `sha512: ${sha512}`)

  fs.writeFileSync(ymlFilePath, hpYml)

  // update release version and date on xml tag in xyz.hyperplay.HyperPlay.metainfo.xml
  console.log(
    'updating release version and date on xml tag in xyz.hyperplay.HyperPlay.metainfo.xml'
  )
  const xmlFilePath =
    './xyz.hyperplay.HyperPlay/xyz.hyperplay.HyperPlay.metainfo.xml'
  let hpXml = fs.readFileSync(xmlFilePath).toString()
  const date = new Date()
  const isoDate = date.toISOString().slice(0, 10)

  hpXml = hpXml.replace(
    /release version="v.*..*..*" date="[0-9]{4}-[0-9]{2}-[0-9]{2}"/,
    `release version="${process.env.RELEASE_VERSION}" date="${isoDate}"`
  )

  fs.writeFileSync(xmlFilePath, hpXml)
  console.log(
    'Finished updating flathub release! Be sure to update release notes manually before merging.'
  )

  // update release notes
  console.log('setting default remote repo for gh cli')
  const setDefaultResult = child_process.spawnSync('gh', [
    'repo',
    'set-default',
    repoName
  ])
  console.log('setDefaultResult stdout = ', setDefaultResult.stdout?.toString())
  console.log(
    'setDefaultResult stderr = ',
    setDefaultResult.stderr?.toString(),
    ' error: ',
    setDefaultResult?.error
  )

  const releaseNotesResult = child_process.spawnSync('gh', [
    'release',
    'view',
    process.env.RELEASE_VERSION ?? 'undefined',
    '--json',
    'body'
  ])
  const releaseNotesStdOut = releaseNotesResult.stdout?.toString()
  console.log('releaseListResult stdout = ', releaseNotesStdOut)
  console.log(
    'releaseListResult stderr = ',
    releaseNotesResult.stderr?.toString()
  )

  const releaseNotesJson = JSON.parse(releaseNotesStdOut)
  const releaseNotesComponents: string[] = releaseNotesJson.body.split('\n')

  // XML Modification with fast-xml-parser
  hpXml = fs.readFileSync(xmlFilePath).toString()

  const parserOptions = {
    ignoreAttributes: false,
    preserveOrder: true,
    format: true, // Enable formatting
    indentBy: '  ' // Use two spaces for indentation
  }

  const parser = new XMLParser(parserOptions)

  const hpXmlJson = parser.parse(hpXml)

  const builder = new XMLBuilder(parserOptions)

  const releaseNotesElements: Record<string, Array<Record<string, string>>>[] =
    [] // An array to hold generated <li> elements

  for (const [i, releaseComponent_i] of releaseNotesComponents.entries()) {
    if (i === 0) continue
    if (!releaseComponent_i.startsWith('*')) continue
    if (releaseComponent_i.includes('http')) continue

    const li = releaseComponent_i
      .replace(/\n/g, '')
      .replace(/\r/g, '')
      .replace(/\t/g, '')
      .slice(1)
      .trim()

    // Creating the <li> element (compatible with fast-xml-parser)
    const releaseNoteElement = {
      li: [
        { '#text': li } // Directly set the text within the <li> element
      ]
    }

    releaseNotesElements.push(releaseNoteElement)
  }

  const componentsTag = hpXmlJson[1].component
  // Locate the 'releases' element within the 'componentsTag'
  const releasesTag = componentsTag.find((val) => val.releases !== undefined)

  // Proceed to find the <ul> element as before
  const releaseListTag = releasesTag?.releases[0].release[0].description[1]

  if (releaseListTag === undefined) {
    throw 'releaseListTag ul undefined'
  }

  releaseListTag.ul = [...releaseNotesElements] // Set the <ul> element to the generated <li> elements

  console.log('new releaseListTag = ', JSON.stringify(releaseListTag, null, 2))

  const updatedHpXml = builder.build(hpXmlJson)

  console.log('updatedHpXml = ', updatedHpXml)

  fs.writeFileSync(xmlFilePath, updatedHpXml)

  console.log(
    'Finished updating flathub release! Please review and merge the flathub repo PR manually.'
  )
}

main()
