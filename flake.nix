{
  description = "Insurance desk simulator";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        nodejs = pkgs.nodejs_22;
        runner = pkgs.writeShellApplication {
          name = "insurance-desk-sim";
          runtimeInputs = [ nodejs ];
          text = ''
            set -euo pipefail

            if [ ! -f "$PWD/package.json" ]; then
              echo "Run \`nix run\` from the project root so local dependencies stay in this folder."
              exit 1
            fi

            export npm_config_cache="$PWD/.npm-cache"

            if [ ! -d "$PWD/node_modules" ]; then
              echo "Installing local dependencies into $PWD/node_modules..."
              npm install
            fi

            exec npm run dev -- "$@"
          '';
        };
      in
      {
        packages.default = runner;

        apps.default = {
          type = "app";
          program = "${runner}/bin/insurance-desk-sim";
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs
          ];

          shellHook = ''
            export npm_config_cache="$PWD/.npm-cache"
            echo "Local npm cache: $npm_config_cache"
          '';
        };
      }
    );
}
