// MIT License

// Copyright (c) 2023 Leandro Facchinetti <license@leafac.com> (https://leafac.com)

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Disclaimer:
// This code was largely adapted for an archived repo https://github.com/leafac/caxa

package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"embed"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// When building this file, a build.tar.gz should be present and will be embedded in the binary

//go:embed build.tar.gz
var data embed.FS

var (
	Identifier           string
	Command              string
	UncompressionMessage string
)

func main() {

	var applicationDirectory string
	for extractionAttempt := 0; true; extractionAttempt++ {
		lock := path.Join(os.TempDir(), "caxac/locks", Identifier, strconv.Itoa(extractionAttempt))
		applicationDirectory = path.Join(os.TempDir(), "caxac/applications", Identifier, strconv.Itoa(extractionAttempt))
		applicationDirectoryFileInfo, err := os.Stat(applicationDirectory)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Fatalf("caxac stub: Failed to find information about the application directory: %v", err)
		}
		if err == nil && !applicationDirectoryFileInfo.IsDir() {
			log.Fatalf("caxac stub: Path to application directory already exists and isn’t a directory: %v", err)
		}
		if err == nil && applicationDirectoryFileInfo.IsDir() {
			lockFileInfo, err := os.Stat(lock)
			if err != nil && !errors.Is(err, os.ErrNotExist) {
				log.Fatalf("caxac stub: Failed to find information about the lock: %v", err)
			}
			if err == nil && !lockFileInfo.IsDir() {
				log.Fatalf("caxac stub: Path to lock already exists and isn’t a directory: %v", err)
			}
			if err == nil && lockFileInfo.IsDir() {
				// Application directory exists and lock exists as well, so a previous extraction wasn’t successful or an extraction is happening right now and hasn’t finished yet, in either case, start over with a fresh name.
				continue
			}
			if err != nil && errors.Is(err, os.ErrNotExist) {
				// Application directory exists and lock doesn’t exist, so a previous extraction was successful. Use the cached version of the application directory and don’t extract again.
				break
			}
		}
		if err != nil && errors.Is(err, os.ErrNotExist) {
			ctx, cancelCtx := context.WithCancel(context.Background())
			if UncompressionMessage != "" {
				fmt.Fprint(os.Stderr, UncompressionMessage)
				go func() {
					ticker := time.NewTicker(time.Second * 5)
					defer ticker.Stop()
					for {
						select {
						case <-ticker.C:
							fmt.Fprint(os.Stderr, ".")
						case <-ctx.Done():
							fmt.Fprintln(os.Stderr, "")
							return
						}
					}
				}()
			}

			if err := os.MkdirAll(lock, 0755); err != nil {
				log.Fatalf("caxac stub: Failed to create the lock directory: %v", err)
			}

			embeddedDataReader, err := data.Open("build.tar.gz")
			if err != nil {
				log.Fatalf("Failed to open embedded data: %v", err)
			}
			defer embeddedDataReader.Close()

			if err := Untar(embeddedDataReader, applicationDirectory); err != nil {
				log.Fatalf("caxac stub: Failed to uncompress embedded data: %v", err)
			}

			os.Remove(lock)

			cancelCtx()
			break
		}
	}
	splitCommand := strings.Split(Command, " ")
	expandedCommand := make([]string, len(splitCommand))
	applicationDirectoryPlaceholderRegexp := regexp.MustCompile(`\{\{\s*caxac\s*\}\}`)
	for key, commandPart := range splitCommand {
		expandedCommand[key] = applicationDirectoryPlaceholderRegexp.ReplaceAllLiteralString(commandPart, applicationDirectory)
	}

	command := exec.Command(expandedCommand[0], append(expandedCommand[1:], os.Args[1:]...)...)
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	err := command.Run()
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		os.Exit(exitError.ExitCode())
	} else if err != nil {
		log.Fatalf("caxac stub: Failed to run command: %v", err)
	}
}

//
// Adapted from https://github.com/leafac/caxa and https://github.com/golang/build/blob/db2c93053bcd6b944723c262828c90af91b0477a/internal/untar/untar.go and https://github.com/mholt/archiver/tree/v3.5.0

// Untar reads the gzip-compressed tar file from r and writes it into dir.
func Untar(r io.Reader, dir string) error {
	return untar(r, dir)
}

func untar(r io.Reader, dir string) (err error) {
	t0 := time.Now()
	nFiles := 0
	madeDir := map[string]bool{}
	zr, err := gzip.NewReader(r)
	if err != nil {
		return fmt.Errorf("requires gzip-compressed body: %v", err)
	}
	tr := tar.NewReader(zr)
	loggedChtimesError := false
	for {
		f, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar error: %v", err)
		}
		if !validRelPath(f.Name) {
			return fmt.Errorf("tar contained invalid name error %q", f.Name)
		}
		rel := filepath.FromSlash(f.Name)
		abs := filepath.Join(dir, rel)

		fi := f.FileInfo()
		mode := fi.Mode()
		switch {
		case mode.IsRegular():
			// Make the directory. This is redundant because it should
			// already be made by a directory entry in the tar
			// beforehand. Thus, don't check for errors; the next
			// write will fail with the same error.
			dir := filepath.Dir(abs)
			if !madeDir[dir] {
				if err := os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
					return err
				}
				madeDir[dir] = true
			}
			wf, err := os.OpenFile(abs, os.O_RDWR|os.O_CREATE|os.O_TRUNC, mode.Perm())
			if err != nil {
				return err
			}
			n, err := io.Copy(wf, tr)
			if closeErr := wf.Close(); closeErr != nil && err == nil {
				err = closeErr
			}
			if err != nil {
				return fmt.Errorf("error writing to %s: %v", abs, err)
			}
			if n != f.Size {
				return fmt.Errorf("only wrote %d bytes to %s; expected %d", n, abs, f.Size)
			}
			modTime := f.ModTime
			if modTime.After(t0) {
				// Clamp modtimes at system time. See
				// golang.org/issue/19062 when clock on
				// buildlet was behind the gitmirror server
				// doing the git-archive.
				modTime = t0
			}
			if !modTime.IsZero() {
				if err := os.Chtimes(abs, modTime, modTime); err != nil && !loggedChtimesError {
					// benign error. Gerrit doesn't even set the
					// modtime in these, and we don't end up relying
					// on it anywhere (the gomote push command relies
					// on digests only), so this is a little pointless
					// for now.
					// log.Printf("error changing modtime: %v (further Chtimes errors suppressed)", err)
					loggedChtimesError = true // once is enough
				}
			}
			nFiles++
		case mode.IsDir():
			if err := os.MkdirAll(abs, 0755); err != nil {
				return err
			}
			madeDir[abs] = true
		case f.Typeflag == tar.TypeSymlink:
			// leafac: Added by me to support symbolic links. Adapted from https://github.com/mholt/archiver/blob/v3.5.0/tar.go#L254-L276 and https://github.com/mholt/archiver/blob/v3.5.0/archiver.go#L313-L332
			err := os.MkdirAll(filepath.Dir(abs), 0755)
			if err != nil {
				return fmt.Errorf("%s: making directory for file: %v", abs, err)
			}
			_, err = os.Lstat(abs)
			if err == nil {
				err = os.Remove(abs)
				if err != nil {
					return fmt.Errorf("%s: failed to unlink: %+v", abs, err)
				}
			}

			err = os.Symlink(f.Linkname, abs)
			if err != nil {
				return fmt.Errorf("%s: making symbolic link for: %v", abs, err)
			}
		default:
			return fmt.Errorf("tar file entry %s contained unsupported file type %v", f.Name, mode)
		}
	}
	return nil
}

func validRelPath(p string) bool {
	if p == "" || strings.Contains(p, `\`) || strings.HasPrefix(p, "/") || strings.Contains(p, "../") {
		return false
	}
	return true
}
