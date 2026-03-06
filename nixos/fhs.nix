{ pkgs ? import <nixpkgs> {} }:

pkgs.buildFHSEnv {
  name = "fhs";
  targetPkgs = pkgs: with pkgs; [
    python3
    python3Packages.pip
    python313
    python313Packages.tkinter
    python313Packages.customtkinter
    uv    
    stdenv.cc.cc.lib
    zlib
    openssl
    tk
    tcl
    xorg.libX11
    xorg.libXcursor
    xorg.libxcb
    go
  ];
  runScript = "fish";
}
