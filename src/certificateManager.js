import forge from "node-forge";

/**
 * A class that provides methods for generating self-signed certificates.
 */
class CertificateManager {
  /**
   * Generates a self-signed certificate and private key pair.
   * @param {string} ip - The IP address to be used as the common name in the certificate.
   * @returns {Object} - An object containing the generated certificate and private key in PEM format.
   */
  static generateSelfSignedCertificates(ip) {
    const pki = forge.pki;
    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter.setFullYear(
      cert.validity.notBefore.getFullYear() + 10
    );

    const attrs = [
      {
        name: "commonName",
        value: ip,
      },
      {
        name: "countryName",
        value: "ES",
      },
      {
        shortName: "ST",
        value: "Madrid",
      },
      {
        name: "localityName",
        value: "Madrid",
      },
      {
        name: "organizationName",
        value: "Anjana",
      },
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Sign certificate with private key
    cert.sign(keys.privateKey);

    return {
      certPem: pki.certificateToPem(cert),
      privateKeyPem: pki.privateKeyToPem(keys.privateKey),
    };
  }
}

export default CertificateManager;
