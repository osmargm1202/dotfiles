package theme

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
)

type AtomicWriter struct {
	Marker string
}

func (w AtomicWriter) Write(path string, content []byte, mode int) error {
	marker := w.Marker
	if marker == "" {
		marker = GeneratedMarker
	}
	if err := guardGenerated(path, []byte(marker)); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".orgm-hypr-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(content); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if mode == 0 {
		mode = 0o600
	}
	if err := os.Chmod(tmpPath, os.FileMode(mode)); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func guardGenerated(path string, marker []byte) error {
	current, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if len(current) == 0 || bytes.Contains(current, marker) {
		return nil
	}
	return fmt.Errorf("refusing to overwrite unmarked existing file %s", path)
}
