# BitTorrent Client - CodeCrafters Challenge

## Overview

This project is a simplified clone of a BitTorrent client, developed as part of the CodeCrafters Challenge. It includes functionalities for parsing magnet links, fetching peer information, and downloading files using the BitTorrent protocol.

## Features

- Parse magnet links to extract torrent metadata.
- Fetch peer information from trackers.
- Perform handshakes with peers.
- Download files from peers.
- Validate downloaded pieces using SHA-1 hash.

## Installation

 Install dependencies:
   ```sh
   npm install
   ```

## Usage

### Commands

- `decode`: Decode a torrent file.
- `info`: Display information about a torrent file.
- `peers`: Fetch and display peer information.
- `handshake`: Perform a handshake with a peer.
- `download_piece`: Download a specific piece from a torrent.
- `download`: Download a complete file from a torrent.
- `magnet_parse`: Parse a magnet link.
- `magnet_handshake`: Perform a handshake using a magnet link.
- `magnet_info`: Fetch and display information using a magnet link.
- `magnet_download`: Download a file using a magnet link.

### Examples

#### Decode a Torrent File
```sh
node app/main.js decode path/to/torrent/file.torrent
```

#### Fetch Peer Information
```sh
node app/main.js peers path/to/torrent/file.torrent
```

#### Download a File
```sh
node app/main.js download path/to/torrent/file.torrent output/file/path
```

#### Parse a Magnet Link
```sh
node app/main.js magnet_parse "magnet:?xt=urn:btih:..."
```

#### Download a File Using a Magnet Link
```sh
node app/main.js magnet_download "magnet:?xt=urn:btih:..." output/file/path
```

## Project Structure

- `app/commands/`: Contains command handlers for various operations.
- `app/utils/`: Utility functions for handling network, torrent, and magnet operations.
- `app/main.js`: Entry point for the application.

