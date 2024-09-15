const axios = require('axios');

module.exports = async (req, res) => {
  const slug = req.params.slug || "default-slug";  // Replace "default-slug" with an appropriate fallback

  try {
    // Making the request directly to the Doggy Market API
    const response = await axios.get(`https://api.doggy.market/nfts/${slug}/holders`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36', // Mimicking browser request
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      }
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching NFTs snapshot', error);
    res.status(500).json({ error: 'Failed to fetch snapshot. Please try again later.' });
  }
};
