const ImageKit = require("imagekit");

let imagekit = null;

const getClient = () => {
  if (imagekit) return imagekit;

  if (
    !process.env.IMAGEKIT_PUBLIC_KEY ||
    !process.env.IMAGEKIT_PRIVATE_KEY ||
    !process.env.IMAGEKIT_URL_ENDPOINT
  ) {
    throw new Error(
      "ImageKit is not configured. Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, and IMAGEKIT_URL_ENDPOINT in .env"
    );
  }

  imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  });
  return imagekit;
};

const uploadProfilePicture = async (fileBuffer, userId) => {
  const result = await getClient().upload({
    file: fileBuffer,
    fileName: `${userId}.jpg`,
    folder: "/chillpick/profile_pictures",
    useUniqueFileName: false,
    overwriteFile: true,
    transformation: {
      pre: "w-512,h-512,fo-face",
    },
  });
  return result;
};

module.exports = { uploadProfilePicture };
