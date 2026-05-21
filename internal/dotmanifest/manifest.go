package dotmanifest

import "strings"

// ContainsNested reports whether rel is exactly managed or nested under a managed path.
func ContainsNested(paths []string, rel string) bool {
	rel = strings.Trim(rel, "/")
	for _, managed := range paths {
		managed = strings.Trim(managed, "/")
		if rel == managed || strings.HasPrefix(rel, managed+"/") {
			return true
		}
	}
	return false
}

func Count(paths []string) int {
	return len(paths)
}
