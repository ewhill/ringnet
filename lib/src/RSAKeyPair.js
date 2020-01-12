
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class RSAKeyPair {
  constructor(options = {}) {
    const {
        privateKeyPath,
        publicKeyPath,
        privateKeyBuffer,
        publicKeyBuffer,
      } = options;

    if(privateKeyPath) {
      const absolutePrivateKeyPath = path.resolve(privateKeyPath);
      if(fs.existsSync(absolutePrivateKeyPath)) {
        this.privateKeyData_ = fs.readFileSync(absolutePrivateKeyPath);
        this.private_ = crypto.createPrivateKey(this.privateKeyData_);
      } else {
        throw new Error(`File does not exist: ${absolutePrivateKeyPath}`);
      }
    }

    if(publicKeyPath) {
      const absolutePublicKeyPath = path.resolve(publicKeyPath);
      if(fs.existsSync(absolutePublicKeyPath)) {
        this.publicKeyData_ = fs.readFileSync(absolutePublicKeyPath);
        this.public_ = crypto.createPublicKey(this.publicKeyData_);
      } else {
        throw new Error(`File does not exist: ${absolutePublicKeyPath}`);
      }
    }

    if(this.private_ && !this.public_) {
      this.public_ = crypto.createPublicKey(this.privateKeyData_);
      this.publicKeyData = this.export({ mode: 'public', returnBuffer: true });
    }

    // "Hard-setting" private / public will overwrite loaded private / public.
    if(privateKeyBuffer) {
      this.privateKeyData_ = privateKeyBuffer;
      this.private_ = crypto.createPrivateKey(this.privateKeyData_);
    }

    if(publicKeyBuffer) {
      this.publicKeyData_ = publicKeyBuffer;
      this.public_ = crypto.createPublicKey(this.publicKeyData_);
    } else {
      if(this.private_) {
        this.public_ = crypto.createPublicKey(this.privateKeyData_);
      }
    }
  }

  get private() {
    return this.export({ mode: 'private', returnBuffer: true });
  }

  get public() {
    return this.export({ mode: 'public', returnBuffer: true });
  }

  set private(privateKeyBuffer) {
    if(this.private_) {
      throw new Error('Private key already set!');
    } else {
      const newPrivate = crypto.createPrivateKey(privateKeyBuffer);
      const newPublic = crypto.createPublicKey(privateKeyBuffer);
      const exportOptions = { type: 'pkcs1', format: 'pem' };
      const newPublicPem = newPublic.export(exportOptions);

      this.privateKeyData_ = privateKeyBuffer;
      this.private_ = newPrivate;
      this.publicKeyData_ = newPublicPem;
      this.public_ = newPublic;
    }
  }

  set public(publicKeyBuffer) {
    if(this.private_) {
      throw new Error('Cannot set public to new RSA Key Pair when a ' +
          'private is already set!');
    } else {
      if(!this.public_) {
        this.publicKeyData_ = publicKeyBuffer;
        this.public_ = crypto.createPublicKey(this.publicKeyData_);
      } else {
        throw new Error('Public key already set!');
      }
    }
  }

  /**
   * Decrypts an encrypted buffer and returns a decrypted buffer.
   * 
   * @param  {Buffer} buffer
   *         A buffer to be decrypted using the private key.
   * @return {Buffer} 
   *         A decrypted buffer.
   */
  decrypt(buffer) {
    if(!this.private_) {
      throw new Error(`Cannot decrypt buffer because no private key is set.`);
    }

    return crypto.privateDecrypt(this.private_, buffer);
  }

  /**
   * Encrypts a given buffer with the private RSA key.
   * 
   * @param  {Buffer} buffer
   *         A buffer to encrypt using the private key.
   * @return {Buffer}
   *         An encrypted buffer.
   */
  encrypt(buffer) {
    const encrypted = crypto.publicEncrypt(this.public_, buffer);
    return encrypted;
  }

  /**
   * Exports the RSA private and / or public keys.
   * 
   * @param  {Object} options 
   *         An options object providing the ability to select what key(s) to 
   *         export, whether to return the data as string(s) or buffer(s), and 
   *         individual export options for private and public keys.
   * @return {Object} 
   *         An object containing the exported key(s).
   */
  export(options = {}) {
    const {
        mode = 'private',
        returnBuffer = false,
      } = options;

    const privateKeyOptions = {
          type: 'pkcs1',
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: '',
        };

    const publicKeyOptions = {
          type: 'pkcs1',
          format: 'pem',
        };

    var ret = null;

    if(mode === 'private') {
      if(!this.private_) {
        throw new Error('No private key set!');
      }

      ret = this.private_.export(privateKeyOptions);
    } else if(mode === 'public') {
      if(!this.public_) {
        throw new Error('No public key set!');
      }

      ret = this.public_.export(publicKeyOptions);
    } else if(mode === 'both') {
      if(!this.private_ || !this.public_) {
        throw new Error('No private key or no public key set!');
      }

      ret = {
        private: this.private_.export(privateKeyOptions),
        public: this.public_.export(publicKeyOptions)
      };
    }

    if(returnBuffer) {
      if(typeof ret === 'object') {
        const keys = Object.keys(ret);
        for(let i=0; i<keys.length; i++) {
          ret[keys[i]] = Buffer.from(ret[keys[i]], 'utf8');
        }
      } else if(typeof ret === 'string') {
        ret = Buffer.from(ret, 'utf8');
      }
    }

    return ret;
  }

  /**
   * Generates a RSA key pair.
   * 
   * @param  {Object} options
   *         Configuration options used when generating the key pair.
   * @return {RSAKey} 
   *         The RSAKey class object, or 'this'.
   */
  generate(options = {}) {
    const {
        passphrase = '',
        modulusLength = 4096
      } = options;

    const { privateKey, publicKey } = 
      crypto.generateKeyPairSync('rsa', {
        modulusLength,
        publicKeyEncoding: {
          type: 'pkcs1',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs1',
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase,
        },
      });

    this.privateKeyData_ = privateKey;
    this.publicKeyData_ = publicKey;

    this.public = this.publicKeyData_;
    this.private = this.privateKeyData_;

    return this;
  }

  /**
   * Signs the given buffer with the private key.
   * 
   * @param  {Buffer} buffer
   *         The buffer to sign.
   * @return {string}
   *         The hex-encoded signature for the given buffer.
   */
  sign(buffer) {
    if(!this.private_) {
      throw new Error(`Cannot sign data because no private key is set.`);
    }

    const sign = crypto.createSign('SHA256');

    sign.update(buffer);
    sign.end();
    return sign.sign(this.private_);
  }

  /**
   * Verifies the given buffer against the given signature.
   * 
   * @param  {Buffer} buffer
   *         The buffer (data) against which we wish the verify the signature.
   * @param  {string} signature
   *         The hex-encoded signature for the given buffer.
   * @return {boolean}
   *         The verification result. Returns true if the signature generated 
   *         matches the given signature.
   */
  verify(buffer, signature) {
    if(!this.public_) {
      throw new Error(`Cannot verify signature because no public key is set.`);
    }

    const verify = crypto.createVerify('SHA256');

    verify.update(buffer);
    verify.end();

    return verify.verify(this.public_, signature);
  }
}

module.exports = RSAKeyPair;