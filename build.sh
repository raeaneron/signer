#!/opt/render/project/src/.bin/bash
# (Render automatically sets shell paths, using standard #!/bin/bash is safer)
#!/bin/bash

# Exit immediately if any command exits with non-zero status
set -e

echo "=== Running Render Build Script ==="

# Install Node modules
echo "Installing Node dependencies..."
npm install

# Compile zsign on Render if we are in the Render environment
if [ "$RENDER" = "true" ]; then
  echo "Detected Render environment. Checking if compiler tools are available..."
  
  if command -v g++ >/dev/null 2>&1; then
    echo "g++ compiler is available. Compiling zsign from source..."
    
    # Clean up previous temporary zsign clone if it exists
    rm -rf tmp-zsign
    
    # Clone and build
    git clone --depth 1 https://github.com/zhlywy/zsign.git tmp-zsign
    cd tmp-zsign
    g++ *.cpp -O3 -lcrypto -lpthread -o ../zsign
    cd ..
    rm -rf tmp-zsign
    
    # Make executable
    chmod +x zsign
    echo "zsign compiled successfully and saved to project root!"
  else
    echo "g++ compiler not found. Fallback to mock signing will be used if certs are missing."
  fi
else
  echo "Not in Render environment. Skipping zsign build."
fi

echo "=== Build Completed ==="
