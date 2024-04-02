import forge from "node-forge";
import JSZip from "jszip";
import stream from "stream";

/**
 * Class representing a Certificate Download Manager.
 */
class CertificateDownloadManager {
  /**
   * Downloads a certificate and private key as a zip file.
   * @param {string} certPem - The certificate in PEM format.
   * @param {string} privateKeyPem - The private key in PEM format.
   * @param {object} response - The response object to send the zip file.
   */
  static donwload(certPem, privateKeyPem, response) {
    const certObj = forge.pki.certificateFromPem(certPem);
    const privateKeyObj = forge.pki.privateKeyFromPem(privateKeyPem);

    // Convertir objeto certificado y clave privada a DER
    const derCert = forge.asn1
      .toDer(forge.pki.certificateToAsn1(certObj))
      .getBytes();
    const derKey = forge.asn1
      .toDer(forge.pki.privateKeyToAsn1(privateKeyObj))
      .getBytes();

    // Node.js Buffer desde los bytes DER
    const derBuffer = Buffer.from(derCert, "binary");
    const keyBuffer = Buffer.from(derKey, "binary");

    const zip = new JSZip();
    zip.file("certificate.crt", derBuffer);
    zip.file("privateKey.crt", keyBuffer);

    zip.generateAsync({ type: "nodebuffer" }).then(function (content) {
      response.type("application/zip");
      response.attachment("certificates.zip");

      const readStream = new stream.PassThrough();
      readStream.end(content);

      readStream.pipe(response);
    });
  }
}

export default CertificateDownloadManager;
